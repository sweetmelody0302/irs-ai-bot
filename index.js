// ==========================================
// 專案：Irs 伊爾絲的心靈幽徑 - 中繼站大腦 
// 修復：1. 允許老闆親自測試 AI 2. 開放網頁檔案(HTML)讀取權限
// ==========================================
const express = require('express');
const axios = require('axios');
const path = require('path');
const app = express();
app.use(express.json());

// ★ 關鍵修復 2：開放網頁檔案權限 (解決 Cannot GET 問題)
// 雙重保險：不管老闆把 html 放在 public 資料夾，還是放在最外面，都讀得到！
app.use(express.static('public')); 
app.use(express.static(__dirname)); 

// --- 環境變數讀取 ---
const LINE_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const DIFY_API_KEY = process.env.DIFY_API_KEY;
const DIFY_API_URL = process.env.DIFY_API_URL || 'https://api.dify.ai/v1/chat-messages';
const LIFF_URL = process.env.LIFF_URL; 

// ⚠️ 老闆的專屬 ID
const BOSS_ID = 'U9bd943de8f86baf28fd585b1e0156cc5'; 

// --- 記憶體資料庫 ---
const userConversations = new Map(); 
const mutedUsers = new Map();        
let lastActiveUserId = null;         

app.post('/webhook', async (req, res) => {
    res.status(200).send('OK'); 

    const events = req.body.events;
    if (!events) return;

    for (let event of events) {
        if (event.type !== 'message' || event.message.type !== 'text') continue;

        const userId = event.source.userId;
        const userMessage = event.message.text.trim();

        // ==========================================
        // 👑 狀況 A：老闆遙控器指令
        // ==========================================
        if (userId === BOSS_ID) {
            if (userMessage === '接手') {
                if (lastActiveUserId) {
                    mutedUsers.set(lastActiveUserId, Date.now() + 12 * 60 * 60 * 1000);
                    await sendLineMessage(event.replyToken, `✅ 遙控成功！\n已暫停該客戶的 AI 助理 12 小時 🤫\n\n👉 請點此前往後台與客戶對話：\nhttps://chat.line.biz/`);
                } else {
                    await sendLineMessage(event.replyToken, `⚠️ 目前沒有活躍的客戶可接手喔！`);
                }
                continue; // ★ 只有輸入指令時，才不傳給 AI
            } 
            else if (userMessage === '恢復') {
                if (lastActiveUserId) {
                    mutedUsers.delete(lastActiveUserId);
                    await sendLineMessage(event.replyToken, `✅ 遙控成功！\n已恢復該客戶的 AI 自動回覆 🤖`);
                }
                continue; // ★ 只有輸入指令時，才不傳給 AI
            }
            // ★ 關鍵修復 1：如果老闆只是打一般文字(測試)，就讓他往下走，給 AI 回覆！
        }

        // ==========================================
        // 👤 狀況 B：AI 處理對話
        // ==========================================
        if (userId !== BOSS_ID) {
            lastActiveUserId = userId; // 記錄最後發話的客戶
        }

        // 🛑 檢查：如果客戶正在被老闆真人接手，AI 閉嘴
        if (mutedUsers.has(userId) && Date.now() < mutedUsers.get(userId)) {
            console.log(`[真人接手模式中] 忽略客戶 ${userId}`);
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
            
            if (userConversations.has(userId)) {
                payload.conversation_id = userConversations.get(userId);
            }

            const difyResponse = await axios.post(DIFY_API_URL, payload, {
                headers: { 'Authorization': `Bearer ${DIFY_API_KEY}` }
            });

            let aiReply = difyResponse.data.answer;
            
            if (difyResponse.data.conversation_id) {
                userConversations.set(userId, difyResponse.data.conversation_id);
            }
            
            if (aiReply.includes('{LIFF_URL}') && LIFF_URL) {
                aiReply = aiReply.replace(/{LIFF_URL}/g, LIFF_URL);
            }

            // 將 AI 的回答傳給 LINE
            await sendLineMessage(event.replyToken, aiReply);

        } catch (err) {
            console.error('Dify Error:', err.response?.data || err.message);
        }
    }
});

// 發送 LINE 訊息共用函數
async function sendLineMessage(replyToken, text) {
    if (!LINE_TOKEN) {
        console.error("未設定 LINE_CHANNEL_ACCESS_TOKEN 環境變數");
        return;
    }
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
