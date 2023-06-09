# Client connect to server
```js

const requestURL = 'ip:port/chat/join'
fetch(`http://${requestURL}`, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        chatId: string,
        userId: string
    })
}).then(res => {
    if(res.headers.get('Upgrade') === 'websocket'){
        const ws = new WebSocket(`ws://${requestURL}`)

        ws.onopen = () => {
            console.log('Connection opened')
            // key exchange here?
        }

        ws.onmessage = (event) => {
            console.log('Message received: ', event.data)
        }

        ws.onclose = () => {
            console.log('Connection closed')
        }
    }else{
        console.error('Server does not support WebSocket upgrade');
    }
}).catch(err => {
    console.error(err)
})
```

# Client generate RSA key pair
```js
const key = await crypto.subtle.generateKey(
    {
        name: "RSA-OAEP",
        modulusLength: 4096,
        publicExponent: new new Uint8Array([0x01, 0x00, 0x01]),
        hash: "SHA-256"
    },
    true,
    ["encrypt", "decrypt"]
)
```

# Client encrypt message
```js
const encrypted = await crypto.subtle.encrypt(
    {
        name: "RSA-OAEP"
    },
    key.publicKey,
    new TextEncoder().encode('Hello World')
)
```

# Client decrypt message
```js
const decrypted = await crypto.subtle.decrypt(
    {
        name: "RSA-OAEP"
    },
    key.privateKey,
    encrypted
)
```

# Key Exchange flow
1. Client generate RSA key pair
2. Client sends public key to server
3. Server sends DES key to client with RSA public key
4. Client decrypt DES key
5. client encrypts challange_response with the DES key and sends it to the server.
The challange response contains the key
6. Server decrypts challange_response and checks if the key is correct
7. Server sends challange_response back to client
    - If correct: responds with challange_success
    - Else: responds with challange_failed
