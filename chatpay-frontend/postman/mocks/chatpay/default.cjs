// Local QA fixture derived from chatpay-backend routes. Never used by production.
const http = require('http');
const crypto = require('crypto');
let recipients = [], payments = [], activeKey = '', challenges = new Map();
const defaultKey = 'G' + 'A'.repeat(55);
http.createServer(async (req, res) => {
  let raw = ''; for await (const chunk of req) raw += chunk;
  const body = raw ? JSON.parse(raw) : {};
  const url = new URL(req.url, 'http://local'); const path = url.pathname;
  const send = (code, data) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
  if (path === '/auth/challenge' && req.method === 'POST') {
    const nonce = crypto.randomUUID(); challenges.set(nonce,body.publicKey);
    return send(200,{ challenge:'ChatPay test challenge', nonce, expiresAt:new Date(Date.now()+300000).toISOString() });
  }
  if (path === '/auth/verify' && req.method === 'POST') {
    if(challenges.get(body.nonce)!==body.publicKey || body.signature!=='test-signature') return send(401,{message:'Invalid authentication signature'});
    activeKey=body.publicKey; challenges.delete(body.nonce);
    return send(200,{token:'qa-only-token',user:{id:'qa-user',publicKey:activeKey}});
  }
  if (req.headers.authorization !== 'Bearer qa-only-token') return send(401,{message:'Please sign in'});
  if (path === '/me/wallet') return send(200,{publicKey:activeKey||defaultKey,exists:true,nativeBalance:'99.90',usdcBalance:payments.some(p=>p.status==='confirmed')?'115.00':'125.00',hasUsdcTrustline:true});
  if(path==='/recipients'&&req.method==='GET') return send(200,recipients);
  if(path==='/recipients'&&req.method==='POST') { const item={id:crypto.randomUUID(),...body,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};recipients.push(item);return send(201,item); }
  if(path==='/commands'&&req.method==='POST') {
    if(!recipients.length) return send(200,{type:'needs_recipient',message:'Save Alex before preparing a payment.',alias:'Alex'});
    const recipient=recipients[0]; const payment={id:crypto.randomUUID(),recipientAlias:recipient.alias,recipientAddress:recipient.address,amount:'10.00',assetCode:'USDC',status:'awaiting_signature',createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+300000).toISOString()};payments.push(payment);
    return send(200,{type:'preview',message:'Review your payment.',preview:{paymentId:payment.id,recipientAlias:recipient.alias,recipientAddress:recipient.address,amount:payment.amount,asset:'USDC',estimatedFee:'100',expiresAt:payment.expiresAt,unsignedXdr:'qa-unsigned-xdr',warnings:[]}});
  }
  if(path==='/payments') {const offset=Number(url.searchParams.get('offset')||0);return send(200,{total:payments.length,offset,limit:20,items:payments.slice(offset,offset+20)});}
  const match=path.match(/^\/payments\/([^/]+)(\/submit)?$/);
  if(match){const payment=payments.find(p=>p.id===match[1]);if(!payment)return send(404,{message:'Payment not found'});
    if(match[2]&&req.method==='POST'){if(body.signedXdr!=='qa-signed-xdr')return send(400,{message:'Invalid signature'});payment.status='confirmed';payment.txHash='a'.repeat(64);return send(200,{paymentId:payment.id,status:payment.status,txHash:payment.txHash,explorerUrl:'https://stellar.expert/explorer/testnet/tx/'+payment.txHash});}
    return send(200,payment);
  }
  send(501,{message:'Endpoint not modeled for this workflow'});
}).listen(process.env.PORT || 4900);
