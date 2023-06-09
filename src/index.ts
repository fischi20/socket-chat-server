import express from 'express'
import { RawData, WebSocket } from 'ws'
import { DES, generateKey } from './des'
import cors from 'cors'
import nodeCrypto from 'node:crypto'

const crypto = nodeCrypto.webcrypto;

type Connection = {
    socket: WebSocket, des: DES, keyExchangeState: () => number
}

type Chat = {
    users: string[],
    messages: ChatMessage[],
    chatId: string,
    connections: Record<string, Connection>
}


type ChatMessage = {
    message_type: 'message',
    chatId: string,
    from: string,
    to_sent: string[]
    to_send: string[],
    message: string
}

type SimpleChatMessage = {
    message_type: 'message',
    chatId: string,
    from: string,
    message: string
}

type FetchPentingMessage = {
    message_type: 'fetch_pending_messages'
}
type PublicKeyMessage = {
    message_type: 'pubKey',
    key: string
}
type ChallangeSuccessMessage = {
    message_type: 'challenge_success',
}
type ChallangeFailMessage = {
    message_type: 'challenge_fail',
}
type ChallengeResponseMessage = {
    message_type: 'challenge_response',
    challenge_response: string
}
type ChallengeMessage = {
    message_type: 'challenge',
    challenge: string
}

type Message = ChatMessage | FetchPentingMessage | PublicKeyMessage | ChallangeSuccessMessage | ChallangeFailMessage | ChallengeResponseMessage | ChallengeMessage

type ChatInit = {
    userTokens: string[],
    chatId: string
}

type ChatConnect = {
    chatId: string,
    userToken: string
}

const app = express()
app.use(express.json())
app.use(cors())

let chats: Record<string, Chat> = {}

function sendMessage(conn: Connection, message: Message) {
    let sendMessageString: string = JSON.stringify(message);
    if (message.message_type === 'message') {
        sendMessageString = JSON.stringify({
            message_type: 'message',
            chatId: message.chatId,
            from: message.from,
            message: message.message
        })
    }

    if (conn.keyExchangeState() == 2) {
        sendMessageString = conn.des.encryptFull(sendMessageString)
    }

    conn.socket.send(sendMessageString)
}

function getPendingMessages(chatId: string, userToken: string) {
    return chats[chatId].messages.filter(message => message.message_type === 'message' && message.to_send.includes(userToken))
}

function getUserConnection(chatId: string, userToken: string) {
    return chats[chatId].connections[userToken]
}

function getChatIdByToken(userToken: string) {
    return Object.keys(chats).find(chatId => chats[chatId].users.includes(userToken))
}

function isConnected(chatId: string, userToken: string) {
    return !!getUserConnection(chatId, userToken)
}

async function importPublicKey(keyString: string) {
    try {
        const externKey = JSON.parse(keyString);
        const cryptoKey = await crypto.subtle.importKey(
            'jwk',
            externKey,
            {
                name: 'RSA-OAEP',
                hash: 'SHA-256',
            },
            true,
            ['encrypt']
        );

        return cryptoKey;
    } catch (error) {
        console.error('Public key import error:', error);
        throw error;
    }
}


function createOnMessageHandler(userToken: string, chatId: string) {
    let keyExchangeState = 0;
    let desKey = '';
    let des: DES = new DES();

    const handler = (data: RawData) => {
        let dataString = data.toString()
        const handleFetchPendingMessages = () => {
            const toSendMessages = getPendingMessages(chatId, userToken)
            console.log(toSendMessages.length)
            for (let i = 0; i < toSendMessages.length; i++) {
                const message = toSendMessages[i]
                console.log(message)
                console.log(message.to_send)
                if (message.message_type === 'message') {
                    sendMessage(getUserConnection(chatId, userToken), message)
                    message.to_sent.push(userToken) // add user to to_sent
                    message.to_send = message.to_send.filter(u => u !== userToken) // remove user from to_send

                    // remove message if all users have received it
                    if (message.to_send.length === 0) {
                        chats[chatId].messages = chats[chatId].messages.filter(m => m !== message)
                    }
                }
            }
        }

        const handlePubKeyMessage = (key: string) => {
            importPublicKey(key).then((cryptoKey) => {
                desKey = generateKey();
                crypto.subtle.encrypt(
                    {
                        name: "RSA-OAEP",
                        length: 4096,
                    },
                    cryptoKey,
                    new TextEncoder().encode(desKey)
                ).then((encrypted) => {
                    const challengeMessage: ChallengeMessage = {
                        message_type: 'challenge',
                        challenge: JSON.stringify(Array.of(new Uint8Array(encrypted)))
                    }
                    sendMessage(getUserConnection(chatId, userToken), challengeMessage)
                    keyExchangeState = 1;
                })
            })
        }

        const handleChallengeResponseMessage = (key: string) => {
            console.log(key === desKey)
            if (key === desKey) {
                sendMessage(getUserConnection(chatId, userToken), { message_type: 'challenge_success' });
                keyExchangeState = 2;
            } else {
                sendMessage(getUserConnection(chatId, userToken), { message_type: 'challenge_fail' });
            }
        }

        const handleChatMessage = (message: ChatMessage) => {
            const users = chats[chatId].users.filter(u => u !== userToken);
            const chatMessage: ChatMessage = {
                message_type: 'message',
                chatId: chatId,
                from: userToken,
                to_send: users,
                to_sent: [],
                message: message.message
            }
            const usersLength = users.length;
            for (let i = 0; i < usersLength; i++) {
                const user = users.shift();
                if (user) {
                    if (isConnected(chatId, user)) {
                        sendMessage(getUserConnection(chatId, user), chatMessage)
                        chatMessage.to_sent.push(user)
                    } else {
                        chatMessage.to_send.push(user)
                    }
                }
            }
        }

        switch (keyExchangeState) {
            case 2: {
                function stringToCharCodes(str: string) {
                    const charCodes = [];
                    for (let i = 0; i < str.length; i++) {
                        charCodes.push(str.charCodeAt(i));
                    }
                    return charCodes;
                }
                dataString = des.decryptFull(dataString)
                dataString = String.fromCharCode(...stringToCharCodes(dataString).filter(byte => byte != 0))
            }
            case 0: {
                const message: Message = JSON.parse(dataString)
                if (message.message_type === 'fetch_pending_messages') {
                    handleFetchPendingMessages()
                }
                if (message.message_type === 'pubKey') {
                    handlePubKeyMessage(message.key)
                }
                if (message.message_type === 'message') {
                    handleChatMessage(message)
                }
                break;
            }
            case 1: {
                const message: Message = JSON.parse(dataString)
                if (message.message_type === 'challenge_response') {
                    des.generateKeys(desKey)
                    handleChallengeResponseMessage(des.decryptFull(message.challenge_response))
                }
                break;
            }
        }
    }

    return {
        handler, des, keyExchangeState: () => keyExchangeState
    };
}

app.post('/chat', (req, res) => {
    const chatBody = req.body as ChatInit
    const chatId = chatBody.chatId
    let chat: Chat | undefined = undefined;
    if (chats[chatId]) {
        chat = chats[chatId]
    } else {
        let users: string[] = []
        chatBody.userTokens.forEach(user => {
            users.push(user)
        })
        const newChat: Chat = {
            chatId: chatId,
            connections: {},
            users,
            messages: [],
        }
        chats[newChat.chatId] = newChat
        chat = newChat
    }
    res.status(200).json({ chatId: chat! })
})

const wss = new WebSocket.Server({ noServer: true })
wss.on('error', (err) => {
    console.error(err)
})
app.get('/chat/join/:userToken', (req, res) => {
    const user = req.params.userToken;
    const chatId = getChatIdByToken(user)!;
    if (!chats[chatId]) {
        console.log("Chat doesn't exist")
        res.status(404).json({ error: 'Chat not found' })
        return
    }
    if (chats[chatId].connections[user]) {
        console.log('User is already connected')
        res.status(400).json({ error: "Can't connect to chat" })
        return
    }

    wss.handleUpgrade(req, req.socket, Buffer.alloc(0), (socket) => {
        const socketUserToken = user;
        const socketChatId = chatId;
        console.log('upgreaded')

        socket.on('error', (err) => {
            console.error(err);
        })
        const { handler, des, keyExchangeState } = createOnMessageHandler(socketUserToken, socketChatId)

        chats[socketChatId].connections[socketUserToken] = {
            des,
            keyExchangeState,
            socket
        }

        socket.on('message', handler)

        socket.on('close', () => {
            getUserConnection(socketChatId, socketUserToken).socket.close();
            delete chats[chatId].connections[socketUserToken]
        })
    })
})

console.log('logUpdates')
app.listen(80, () => {
    console.log('Server started on port 80')
})

function strToBin(desKey: string): any {
    throw new Error('Function not implemented.')
}
