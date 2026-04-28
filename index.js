// ==========================================
// 專案：Irs 伊爾絲的心靈幽徑 - 專屬 AI 客服中繼站
// 用途：負責攔截 LINE 訊息，轉發給 Dify，並替換 LIFF 尊榮表單網址
// ==========================================

const express = require('express');
const line = require('@line/bot-sdk');
const axios = require('axios');
require('dotenv').config();

const app = express();

// 1. 從環境變數抓取老闆的各項金鑰
const lineConfig = {
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
    channelSecret: process.env.LINE_CHANNEL_SECRET
};

const client = new line.Client(lineConfig);

// CTO 商業思維：加入記憶體機制，讓 AI 能記住同一個客戶的上下文，對話更自然！
const conversations = {};

// 2. 建立靜態資料夾，用來放我們高質感的 liff_form.html
app.use(express.static('public'));

// 3. 這是 LINE 專屬的接收暗門 (Webhook)
app.post('/webhook', line.middleware(lineConfig), async (req, res) => {
    try {
        const events = req.body.events;
        await Promise.all(events.map(handleEvent));
        res.json({ success: true });
    } catch (err) {
        console.error('Webhook 處理發生錯誤:', err);
        res.status(500).end();
    }
});

// 4. 核心對話處理邏輯
async function handleEvent(event) {
    // 如果不是文字訊息（例如傳貼圖、照片），我們這次先不處理，或是回覆安撫語
    if (event.type !== 'message' || event.message.type !== 'text') {
        if (event.type === 'message' && event.message.type === 'image') {
            return client.replyMessage(event.replyToken, {
                type: 'text',
                text: '🌿 親愛的，我收到您的照片囉！請記得在等一下的評估表單中告知老師您有上傳照片，老師會親自為您檢視的 🕊️'
            });
        }
        return null; 
    }
    
    const userId = event.source.userId;
    const userMessage = event.message.text;

    try {
        // 準備打給 Dify AI 大腦的資料包
        const requestData = {
            inputs: {},
            query: userMessage,
            response_mode: 'blocking',
            user: userId // 讓 Dify 知道是哪位客戶
        };

        // 如果這個客戶之前聊過，我們就把對話紀錄 ID 帶進去，讓 AI 有記憶
        if (conversations[userId]) {
            requestData.conversation_id = conversations[userId];
        }

        // 呼叫 Dify 大腦
        const difyRes = await axios.post('https://api.dify.ai/v1/chat-messages', requestData, {
            headers: {
                'Authorization': `Bearer ${process.env.DIFY_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        let aiReply = difyRes.data.answer;

        // 更新這個客戶的對話 ID
        if (difyRes.data.conversation_id) {
            conversations[userId] = difyRes.data.conversation_id;
        }

        // ★ CTO 轉換率魔法：攔截並替換專屬表單網址 ★
        // 當 AI 判定需要真人介入時，會說出 {LIFF_URL}，我們就在這裡把它換成真的可以點擊的 LINE 專屬網址！
        if (aiReply.includes('{LIFF_URL}')) {
            const liffUrl = process.env.LIFF_URL || '請老闆設定LIFF_URL環境變數';
            aiReply = aiReply.replace('{LIFF_URL}', liffUrl);
        }

        // 把 AI 的回覆傳回給客戶的 LINE
        return client.replyMessage(event.replyToken, {
            type: 'text',
            text: aiReply
        });

    } catch (error) {
        console.error('呼叫 Dify 發生錯誤:', error.response ? error.response.data : error.message);
        // 優雅的錯誤安撫，不讓客戶看到程式碼錯誤
        return client.replyMessage(event.replyToken, {
            type: 'text',
            text: '✨ 親愛的，宇宙的能量目前正在重組中，請您稍等幾分鐘後再跟我說一次話喔 🕊️'
        });
    }
}

// 5. 啟動伺服器
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`老闆，Irs AI 客服大掌櫃已在連接埠 ${port} 啟動，準備接單賺錢啦！🔥`);
});
