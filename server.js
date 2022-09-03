const express = require('express');
const app = express();
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const server = http.createServer(app);
const path = require('path');

// app.use(cors());
app.use(
  cors({
    origin: [
      'http://localhost:3000',
      'https://tovehydmark.github.io/gridpainter-frontend',
    ],
    methods: ['GET', 'POST'],
    credentials: true,
  })
);
app.use(express.static(path.resolve(__dirname, '/../../frontend/build')));
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

const tileList = [];

// const io = new Server(server);

const io = new Server(server, {
  cors: {
    origin: [
      // '*',
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

//Socket.io
io.on('connection', function (socket) {
  const count = io.engine.clientsCount;
  console.log(`User connected, ${count} users connected.`);

  socket.on('disconnect', function () {
    console.log('User disconnected');
  });

  socket.on('message', function (msg) {
    io.emit('message', msg);
  });

  socket.on('join-game', function (usernameAndRoom) {
    socket.join(usernameAndRoom.room);
    console.log('User joined room: ' + usernameAndRoom.room);

    const convertedToArray = Array.from(io.sockets.adapter.rooms);
    const filteredRooms = convertedToArray.filter(
      (room) => !room[1].has(room[0])
    );
    const rooms = filteredRooms.map((roomArray) => roomArray[0]);

    const roomsWithSocketIDs = filteredRooms.map((roomArray) => {
      let roomSocket = {
        room: roomArray[0],
        users: Array.from(roomArray[1]),
      };
      return roomSocket;
    });

    let response = 'avaliable';

    if (roomsWithSocketIDs[0].users.length > 4) {
      console.log(roomsWithSocketIDs);
      response = 'full';
    }

    if (roomsWithSocketIDs[0].users.length === 4) {
      console.log(roomsWithSocketIDs);
      response = 'getImage';
    }

    io.emit('joinedRoom', response);
    io.to(socket.id).emit('userData', colors[count - 1]);
  });

  socket.on('loadIn', function () {
    io.emit('loadIn', tileList);
  });

  socket.on('randomImageFromServer', function (img) {
    io.emit('randomImageFromServer', img);
  });

  socket.on('default_image', function (img) {
    io.emit('default_image', img);
  });

  socket.on('created_image', function (img) {
    io.emit('created_image', img);
  });

  socket.on('clickedOnTile', function (tile) {
    //Om tileList.length är 0 pushas första tile in i listan
    if (tileList.length == 0) {
      tileList.push({ pixel: tile.pixel, color: tile.color });
    }

    //Loopar igenom tileList och kollar ifall aktuell tile finns i listan. Om ja ändras värdet på color
    for (let i = 0; i < tileList.length; i++) {
      if (tileList[i].pixel == tile.pixel) {
        index = tileList.findIndex((obj) => obj.pixel === tile.pixel);

        tileList[index].color = tile.color;
      }
    }

    //Här kollar den igen om aktuell tile finns i tileList. Om funktionen findIndex() inte hittar något returnerar den -1.
    //Om index är -1 pushas då aktuell tile till listan
    if (tileList.length > 0) {
      let index = tileList.findIndex((obj) => obj.pixel == tile.pixel);

      if (index === -1) {
        tileList.push(tile);
      }
    }

    console.log('tileList: ', tileList);

    io.emit('tileClicked', tileList);
  });

  socket.on('canPaint', function () {
    io.emit('canPaint');
  });

  let timerIsStarted = false;
  let countdownTimerIsStarted = false;

  function gameTimer() {
    if (timerIsStarted === false) {
      timerIsStarted = true;

      let timer = 10;
      const interval = setInterval(() => {
        timer--;
        if (timer <= 0) {
          socket.emit('timerDone');
          clearInterval(interval);
        }
        socket.emit('timer', timer);
        // console.log(timer);
      }, 1000);
    }
  }

  socket.on('startCountdownTimer', function () {
    if (countdownTimerIsStarted === false) {
      countdownTimerIsStarted = true;

      let timer = 6;
      const interval = setInterval(() => {
        timer--;
        if (timer <= 0) {
          gameTimer();
          clearInterval(interval);
        }
        socket.emit('countdownTimer', timer);
        // console.log(timer);
      }, 1000);
    }
  });
});

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

app.get('/', function (req, res) {
  res.sendFile(path.resolve('public/build/index.html'));
});

app.get('/saved_images', function (req, res) {
  // res.header('Access-Control-Allow-Origin', '*');

  req.app.locals.db
    .collection('saved_images')
    .find()
    .toArray()
    .then((result) => {
      res.json(result);
    });
});

app.get('/default', function (req, res) {
  // res.header('Access-Control-Allow-Origin', '*');

  req.app.locals.db
    .collection('default_images')
    .aggregate([{ $sample: { size: 1 } }])
    //.find({ObjectId("6310a7b5ecd365c870d5d63a")})
    .toArray()
    .then((result) => {
      res.json(result);
    });
});
