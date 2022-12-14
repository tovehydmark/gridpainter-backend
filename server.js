const express = require('express');
const app = express();
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const server = http.createServer(app);

app.use(
  cors({
    origin: [
      'http://localhost:3000',
      'https://tovehydmark.github.io/gridpainter-frontend',
      'https://tovehydmark.github.io',
      'https://tovehydmark.github.io/gridpainter-frontend/#/artGallery'
    ],
    methods: ['GET', 'POST'],
    credentials: true,
  })
);
require('dotenv').config();
app.use(express.json());
app.use(
  express.urlencoded({
    extended: false,
  })
);

const MongoClient = require('mongodb').MongoClient;

MongoClient.connect(process.env.MONGO_URI, {
  useUnifiedTopology: true,
}).then((client) => {
  console.log('Connected to DB.');

  app.locals.db = client.db('gridpainter');
});

let tileList = [];

const io = new Server(server, {
  cors: {
    origin: [
      'http://localhost:3000',
      'https://tovehydmark.github.io/gridpainter-frontend',
      'https://tovehydmark.github.io', 
      'https://tovehydmark.github.io/gridpainter-frontend/#/artGallery',
    ],
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

server.listen(process.env.PORT, () => {
  console.log(`Server running on ${process.env.PORT}`);
});

let colors = ['red', 'blue', 'green', 'yellow'];

let timerIsStarted = false;
let countdownTimerIsStarted = false;

//Socket.io
io.on('connection', function (socket) {
  const count = io.engine.clientsCount;
  console.log(`User connected, ${count} users connected.`);

  socket.on('disconnect', function () {
    console.log('User disconnected');
  });

  socket.on('message', function (msg) {
    io.to('room0').emit('message', msg);
  });

  socket.on('join-game', function () {
    socket.join('room0');

    let playersInRoom = io.sockets.adapter.rooms.get('room0').size;

    let response = '';

    if (playersInRoom < 4 && playersInRoom > 0) {
      response = 'available';
    }

    //Skickar full som respons vilket triggar alert "spel fullt" om man f??rs??ker logga in 5
    if (playersInRoom > 4) {
      response = 'full';
    }

    let socketsInRoom = [
      ...io.sockets.adapter.rooms.get('room0'),
    ];

    //Spelarnas f??rger tilldelas d?? 4 spelare connectat och bild fr??n databasen slumpas
    if (playersInRoom === 4) {
      for (let i = 0; i < colors.length; i++) {
        io.to(socketsInRoom[i]).emit('userData', colors[i]);
      }

      response = 'getImage';
      socket.emit('joinedRoom', response);
    }

    io.to(socket.id).emit('joinedRoom', response);
  });

  //Skickar uppdaterad tilelist till alla spelare 
  socket.on('loadIn', function () {
    io.emit('loadIn', tileList);
  });

  //H??mtar och skickar bild fr??n servern till alla spelare
  socket.on('randomImageFromServer', function (img) {
    io.emit('randomImageFromServer', img);
  });

  //Sparar randomImageFromServer till r??ttningsfunktionen som den ritade bilden ska j??mf??ras med
  socket.on('default_image', function (img) {
    io.emit('default_image', img);
  });

  //Sparar den ritade bilden + emittar till r??ttningsfunktionen
  socket.on('created_image', function (img) {
    socket.emit('created_image', img); 
  });

  //Skickar array med uppdaterade f??rger mellan spelare
  socket.on('clickedOnTile', function (tile) {
    if (tileList.length === 0) {
      tileList.push({ pixel: tile.pixel, color: tile.color });
    }

    //Loopar igenom tileList och kollar ifall aktuell tile finns i listan. Om ja ??ndras v??rdet p?? color
    for (let i = 0; i < tileList.length; i++) {
      if (tileList[i].pixel == tile.pixel) {
        index = tileList.findIndex((obj) => obj.pixel === tile.pixel);

        tileList[index].color = tile.color;
      }
    }

    //H??r kollar den igen om aktuell tile finns i tileList. Om funktionen findIndex() inte hittar n??got returnerar den -1.
    //Om index ??r -1 pushas d?? aktuell tile till listan
    if (tileList.length > 0) {
      let index = tileList.findIndex((obj) => obj.pixel == tile.pixel);

      if (index === -1) {
        tileList.push(tile);
      }
    }

    io.emit('tileClicked', tileList);
  });

  //G??r att spelare kan b??rja m??la
  socket.on('canPaint', function () {
    io.emit('canPaint', true);
  });

  //Timer som r??knar ned n??r spelet startar. 
  //Styr s?? spelare kan m??la, s?? de inte kan m??la n??r tiden ??r ute, aktiverar sparaknappen
  function gameTimer() {
    if (timerIsStarted === false) {
      timerIsStarted = true;

      let timer = 30;
      const interval = setInterval(() => {
        timer--;

        if(timer === 0){
            io.emit('canPaint', false);
        }

        if (timer === -1) {
            io.emit('timerDone');
            io.emit('enableSaveButton');
            tileList = [];
            timerIsStarted = false;

            clearInterval(interval);
        }
        io.emit('timer', timer);
      }, 1000);
    }
  }
  
  //Timer innan spelet startar, startas automatiskt n??r det ??r 4 spelare inloggade
  socket.on('startCountdownTimer', function () {
    if (countdownTimerIsStarted === false) {
      countdownTimerIsStarted = true;

      let timer = 6;
      const interval = setInterval(() => {
        timer--;
        if (timer <= 0) {
          gameTimer();
          countdownTimerIsStarted = false;
          clearInterval(interval);
        }
        io.emit('countdownTimer', timer);
      }, 1000);
    }
  });

  //Inaktiverar + aktiverar spara-knappen hos alla spelare
  socket.on('disableSaveButtonClient', function(){
    io.emit('disableSaveButton');
  });
  
});

//Sparar ritade bilder till databasen
app.post('/', function (req, res) {
  console.log('req.body: ', req.body);

  try {
    req.app.locals.db
      .collection('saved_images')
      .insertOne({ tiles: req.body })
      .then((result) => {
        console.log(result);
      });

    res.send();
  } catch (err) {
    console.log(err);
  }
});

//H??mtar alla sparade bilder 
app.get('/saved_images', function (req, res) {
  res.header('Access-Control-Allow-Origin', '*'); 

  req.app.locals.db
    .collection('saved_images')
    .find()
    .toArray()
    .then((result) => {
      res.json(result);
    });
});

//H??mtar en slumpm??ssig bild fr??n databasen, som spelare ska efterlikna
app.get('/default', function (req, res) {
  res.header('Access-Control-Allow-Origin', '*'); 

  req.app.locals.db
    .collection('default_images')
    .aggregate([{ $sample: { size: 1 } }])    
    .toArray()
    .then((result) => {
      res.json(result);
    });
});
