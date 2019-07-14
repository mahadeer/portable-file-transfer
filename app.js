'use strict';
const opn = require('opn');
const Koa = require('koa');
const serve = require('koa-static');
const koaBody = require('koa-body');
const path = require('path');
const siofu = require("socketio-file-upload");
const app = new Koa();
const currentIp = getAddress();
const port = 1307;

app.use(koaBody({ multipart: true }));

app.use(async function (ctx, next) {
    await next();
    if (ctx.body || !ctx.idempotent) return;
    ctx.redirect('/404.html');
});

app.use(serve(path.join(__dirname, '/public')));
siofu.listen(app);

const server = require("http").Server(app.callback()),
    io = require("socket.io")(server);

const senderIo = io.of('/sender');
const receiverIo = io.of("/receive");

let isSenderAvailable = false;
let receivers = 0;

senderIo.on('connection', function (senderClient) {
    if (isSenderAvailable) {
        senderClient.emit('rejected');
        senderClient.disconnect();
        console.log('Sender rejected');
        return;
    } else {
        isSenderAvailable = true;
        senderClient.emit('registered');
        if (receivers > 0) {
            receiverIo.emit('connected');
        }
        senderClient.on('disconnect', function () {
            console.log('Sender disconnected');
            isSenderAvailable = false;
            receiverIo.emit("no-sender");
        });
    }
    var uploader = new siofu();
    uploader.dir = "public/temp/";
    uploader.listen(senderClient);
});

receiverIo.on('connection', function (receiverClient) {
    if (!isSenderAvailable) {
        receiverClient.emit('no-sender');
    }
    receivers++;
    receiverIo.emit('connections', receivers);
    receiverClient.on('disconnect', function () {
        console.log('Receiver disconnected');
        receivers--;
        receiverIo.emit('connections', receivers);
    });
});

server.listen(port, currentIp, function () {
    console.log(currentIp + ":" + port);
    console.log("Server is listening....");
    // opn('http://{ip}:{port}'.replace("{ip}", currentIp).replace("{port}", port));
    // clearCache();
});

function clearCache() {
    const fs = require('fs');
    const directory = 'public/temp/';

    fs.readdir(directory, (err, files) => {
        if (err) throw err;
        for (const file of files) {
            fs.unlink(path.join(directory, file), err => {
                if (err) throw err;
            });
        }
        console.log("Cache Cleared...");
    });
}

function getAddress() {
    var os = require('os');
    var ifaces = os.networkInterfaces();

    var address = "";
    Object.keys(ifaces).forEach(function (ifname) {
        ifaces[ifname].forEach(function (iface) {
            if ('IPv4' !== iface.family || iface.internal !== false) {
                return;
            }
            address = iface.address;
            return false;
        });
    });
    return address;
}