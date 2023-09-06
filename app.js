const express = require('express')
const axios = require('axios');
const crypto = require('node:crypto');
const fs = require('node:fs');

const app = express()
const port = 3000
const domain = "fairly-legal-tapir.ngrok-free.app";

const privKey = fs.readFileSync('./certs/private.pem')
const pubKey = fs.readFileSync('./certs/public.pem', 'utf-8')

const followers = new Set();

app.use(express.json({type: ['application/json', 'application/activity+json']}));

app.get('/', (req, res) => {
  res.send('Hello World!')
})

app.get('/.well-known/webfinger', (req, res) => {
  // acct:hoge@fairly-legal-tapir.ngrok-free.app
  const user = req.query.resource.split(":")[1].split("@")[0];
  const body = {
    "subject": `${req.query.resource}`,
    "links": [ 
      {
        "rel": "self",
        "type": "application/activity+json",
        "href": `https://fairly-legal-tapir.ngrok-free.app/u/${user}`
      }
    ] 
  }
  console.log(body);
  res.json(body);
});

app.get('/u/:username', function(req, res) {
  const userName = req.params.username;
  const resbody = {
    "@context": [
      "https://www.w3.org/ns/activitystreams",
      "https://w3id.org/security/v1"
    ],
    "id": `https://${domain}/u/${userName}`, 
    "type": "Person",
    "preferredUsername": `${userName}`,
    "inbox": `https://${domain}/api/inbox`,
    "publicKey": {
      "id": `https://${domain}/u/${userName}#main-key`,
      "owner": `https://${domain}/u/${userName}`,
      "publicKeyPem": pubKey,
    }
  }
  console.log(resbody)
  res.json(resbody);
});

app.post('/api/inbox', async (req, res) => {
  if(!req.body.id || !(/mastodon.social/.test(req.body.id) || /mstdn.jp/.test(req.body.id))) {
    return;
  }
  if (req.body.type !== 'Follow') {
    return res.json({});
  }

  const actor = req.body.actor;
  const guid = crypto.randomBytes(16).toString('hex');
  const accept = {
    '@context': 'https://www.w3.org/ns/activitystreams',
    id: `https://${domain}/${guid}`,
    type: 'Accept',
    actor: req.body.object,
    object: {
      '@context': 'https://www.w3.org/ns/activitystreams',
      id: req.body.id,
      type: 'Follow',
      actor: req.body.actor,
      object: req.body.object,
    }
  }

  let name = req.body.object.replace(`https://${domain}/u/`,'');
  try {
    // 署名を作る
    const headers = sign(accept, name, domain, req.body.actor);
    console.log("POST Accept activity");
    console.log(headers);
    console.log(accept)
    
    // 署名をつけてAcceptメッセージを送信
    const ret = await axios.post(`${actor}/inbox`, accept, {
      headers
    });
    console.log(`res: ${ret.status}`);
    followers.add(req.body.actor);
  } catch (e) {
    console.log(e.message);
  }

  res.status(202).send(''); // 202: Accepted
});


// 管理用API
app.post('/exe/post', async (req, res) => {
  const msg = req.body.msg;
  const from = req.body.from;
  for (let follower of followers) {
    const guidCreate = crypto.randomBytes(16).toString('hex');
    const guidNote = crypto.randomBytes(16).toString('hex');
    let d = new Date();
  
    let noteMessage = {
      'id': `https://${domain}/m/${guidNote}`,
      'type': 'Note',
      'published': d.toISOString(),
      'attributedTo': `https://${domain}/u/${from}`,
      'content': msg,
      'to': ['https://www.w3.org/ns/activitystreams#Public'],
    };
  
    let create = {
      '@context': 'https://www.w3.org/ns/activitystreams',
      'id': `https://${domain}/m/${guidCreate}`,
      'type': 'Create',
      'actor': `https://${domain}/u/${from}`,
      'to': ['https://www.w3.org/ns/activitystreams#Public'],
      'cc': [follower],
      'object': noteMessage
    };

    try {
      // 署名を作る
      const headers = sign(create, from, domain, follower);
      console.log("POST Create activity to", follower);
      console.log(headers);
      console.log(create)
      
      // 署名をつけてAcceptメッセージを送信
      const ret = await axios.post(`${follower}/inbox`, create, {
        headers
      });
      console.log(`res: ${ret.status}`);
    } catch (e) {
      console.log(e.message);
    }
  }

  res.status(200).send('ok');
});


app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
});

// utils
function sign(message, name, domain, actor) { 
  let inbox = actor+'/inbox';
  const actorURL = new URL(actor);
  let targetDomain = actorURL.hostname;
  let path = inbox.replace('https://'+targetDomain, '');

  const digestHash = crypto.createHash('sha256').update(JSON.stringify(message)).digest('base64');
  const signer = crypto.createSign('sha256');
  let d = new Date();
  let stringToSign = `(request-target): post ${path}\n`
  stringToSign += `host: ${targetDomain}\n`;
  stringToSign += `date: ${d.toUTCString()}\n`;
  stringToSign += `digest: SHA-256=${digestHash}`;
  signer.update(stringToSign);
  signer.end();
  const signature = signer.sign(privKey);
  const signature_b64 = signature.toString('base64');

  return {
    'Host': targetDomain,
    'Date': d.toUTCString(),
    'Digest': `SHA-256=${digestHash}`, 
    'Signature': `keyId="https://${domain}/u/${name}#main-key",headers="(request-target) host date digest",signature="${signature_b64}"`,
  }
}
