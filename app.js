'use strict';
const opn = require('opn');
const Koa = require('koa');
const serve = require('koa-static');
const Router = require('koa-router')
const koaBody = require('koa-body');
const path = require('path');
const siofu = require("socketio-file-upload");
const fs = require('fs');
const app = new Koa();
const currentIp = getAddress();
const port = 1307;
const directory = 'public/received/';

app.use(koaBody({ multipart: true }));

app.use(async function (ctx, next) {
    await next();
    if (ctx.body || !ctx.idempotent) return;
    ctx.redirect('/404.html');
});

const router = new Router();
router.get("/download/:filename", function(ctx, next){
    var filePath = path.join(__dirname, '/public/received/', ctx.params.filename);
    ctx.body = fs.createReadStream(filePath);
    ctx.attachment(filePath);
});

app.use(serve(path.join(__dirname, '/public')));
app.use(router.middleware());
siofu.listen(app);

const server = require("http").Server(app.callback()),
    io = require("socket.io")(server);

const senderIo = io.of('/sender');
const receiverIo = io.of("/receive");
let inProgress = [];

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

        senderClient.on("error-upload", function (fN) {
            try {
                fs.unlink(path.join(directory, fN), err => {
                    if (err) throw err;
                    if (err) throw err;
                    var idx = inProgress.indexOf(fN);
                    inProgress.splice(idx, 1);
                    receiverIo.emit("files-updated", getFiles());
                });
                console.log("Error uploading file");
            } catch (ex) {
                console.log(ex);
            }
        });
    }
    var uploader = new siofu();
    uploader.dir = directory;
    uploader.listen(senderClient);
    uploader.on("start", function (event) {
        inProgress.push(event.file.name);
    });
    uploader.on("complete", function (event) {
        var idx = inProgress.indexOf(event.file.name);
        inProgress.splice(idx, 1);
    });
    uploader.on("error", function (fileInfo) {
        fs.unlink(fileInfo.file.pathName, err => {
            if (err) throw err;
            var idx = inProgress.indexOf(event.file.name);
            inProgress.splice(idx, 1);
        });
        console.log("Error uploading file");
    });
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
    receiverIo.emit("files-updated", getFiles());
});

server.listen(port, currentIp, function () {
    console.log(currentIp + ":" + port);
    console.log("Server is listening....");
    opn('http://{ip}:{port}'.replace("{ip}", currentIp).replace("{port}", port));
    // clearCache();
});

function getFiles() {
    var files = [];
    fs.readdirSync(directory).forEach(function (file) {
        if (inProgress.indexOf(file) === -1) {
            files.push(file);
        }
    });
    return files;
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