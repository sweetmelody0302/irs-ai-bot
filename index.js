// ==========================================
// 專案：Irs 伊爾絲的心靈幽徑 - 中繼站大腦 (含老闆遙控器)
// 用途：串接 LINE 與 Dify AI，並支援老闆輸入「接手」暫停 AI
// ==========================================
const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

// --- 環境變數讀取 ---
const LINE_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const DIFY_API_KEY = process.env.DIFY_API_KEY;
const DIFY_API_URL = process.env.DIFY_API_URL || 'https://api.dify.ai/v1/chat-messages';
const LIFF_URL = process.env.LIFF_URL; 

// ⚠️ 寫入老闆的專屬 ID，讓系統認得您的遙控器指令
const BOSS_ID = 'U9bd943de8f86baf28fd585b1e0156cc5'; 

// --- 記憶體資料庫 ---
const userConversations = new Map(); // 記錄 Dify 上下文 ID
const mutedUsers = new Map();        // 記錄被靜音(真人接手)的客戶 { userId: expireTimestamp }
let lastActiveUserId = null;         // 記錄最後一個傳訊息的客戶

app.post('/webhook', async (req, res) => {
    res.status(200).send('OK'); // 先回傳 200 OK，避免 LINE Timeout

    const events = req.body.events;
    if (!events) return;

    for (let event of events) {
        if (event.type !== 'message' || event.message.type !== 'text') continue;

        const userId = event.source.userId;
        const userMessage = event.message.text.trim();

        // ==========================================
        // 👑 狀況 A：如果是老闆本人的遙控指令
        // ==========================================
        if (userId === BOSS_ID) {
            if (userMessage === '接手') {
                if (lastActiveUserId) {
                    // 將上一位客戶靜音 12 小時
                    mutedUsers.set(lastActiveUserId, Date.now() + 12 * 60 * 60 * 1000);
                    await sendLineMessage(event.replyToken, `✅ 遙控成功！\n已暫停該客戶的 AI 助理 12 小時 🤫\n\n👉 請點此前往後台與客戶對話：\nhttps://chat.line.biz/`);
                } else {
                    await sendLineMessage(event.replyToken, `⚠️ 目前沒有活躍的客戶可接手喔！`);
                }
            } else if (userMessage === '恢復') {
                if (lastActiveUserId) {
                    mutedUsers.delete(lastActiveUserId); // 解除靜音
                    await sendLineMessage(event.replyToken, `✅ 遙控成功！\n已恢復該客戶的 AI 自動回覆 🤖`);
                }
            }
            continue; // 老闆的對話不傳給 AI，直接結束這回合
        }

        // ==========================================
        // 👤 狀況 B：如果是一般客戶的訊息
        // ==========================================
        lastActiveUserId = userId; // 記錄他為最後發話者

        // 🛑 檢查：如果老闆正在接手，AI 閉嘴不回覆
        if (mutedUsers.has(userId) && Date.now() < mutedUsers.get(userId)) {
            console.log(`[真人接手模式中] 忽略客戶 ${userId} 的訊息`);
            continue; 
        }

        // 🤖 正常情況：呼叫 Dify AI
        try {
            const payload = {
                inputs: {},
                query: userMessage,
                response_mode: "blocking",
                user: userId
            };
            
            // 如果有舊對話，帶入上下文
            if (userConversations.has(userId)) {
                payload.conversation_id = userConversations.get(userId);
            }

            const difyResponse = await axios.post(DIFY_API_URL, payload, {
                headers: { 'Authorization': `Bearer ${DIFY_API_KEY}` }
            });

            let aiReply = difyResponse.data.answer;
            
            // 記憶上下文 ID
            if (difyResponse.data.conversation_id) {
                userConversations.set(userId, difyResponse.data.conversation_id);
            }
            
            // 將 {LIFF_URL} 變數替換為真實網址
            if (aiReply.includes('{LIFF_URL}') && LIFF_URL) {
                aiReply = aiReply.replace(/{LIFF_URL}/g, LIFF_URL);
            }

            // 將 AI 的回答傳給客戶
            await sendLineMessage(event.replyToken, aiReply);

        } catch (err) {
            console.error('Dify Error:', err.response?.data || err.message);
        }
    }
});

// 發送 LINE 訊息的共用函數
async function sendLineMessage(replyToken, text) {
    try {
        await axios.post('https://api.line.me/v2/bot/message/reply', {
            replyToken: replyToken,
            messages: [{ type: 'text', text: text }]
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${LINE_TOKEN}`
            }
        });
    } catch (err) {
        console.error('LINE Reply Error:', err.response?.data || err.message);
    }
}

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));
