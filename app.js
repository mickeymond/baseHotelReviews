// Author: Oliver Rodriguez

// Modules to import
const express = require("express");
const cfenv = require("cfenv");
const app = express();
const server = require("http").createServer(app);
const io = require('socket.io')(server);

//Import Watson Developer Cloud SDK
const AssistantV2 = require('ibm-watson/assistant/v2');
const DiscoveryV1 = require('ibm-watson/discovery/v1');
const { IamAuthenticator } = require('ibm-watson/auth');

// Import service credentials
const serviceCredentials = require('./service-credentials.json');

// Get the environment variables from Cloud Foundry
const appEnv = cfenv.getAppEnv();

// Serve the static files in the /public directory
app.use(express.static(__dirname + '/public'));

// Create the Assistant instance
const assistant = new AssistantV2({
  version: '2019-02-28',
  authenticator: new IamAuthenticator({
    apikey: serviceCredentials.assistant.apikey
  }),
  url: serviceCredentials.assistant.url
});

// Create the Discovery instance
const discovery = new DiscoveryV1({
  version: '2019-04-30',
  authenticator: new IamAuthenticator({
    apikey: serviceCredentials.discovery.apikey
  }),
  url: serviceCredentials.discovery.url
});

// start server on the specified port and binding host
server.listen(appEnv.port, '0.0.0.0', function() {
  // print a message when the server starts listening
  console.log("server starting on " + appEnv.url);
});

io.on('connection', function(socket) {
  console.log('a user has connected');

  // Handle incomming chat messages
  socket.on('chat message', function(msg) {

    // console.log('message: ' + msg);
    io.emit('chat message', "you: " + msg);

    /*****************************
        Send text to Assistant
    ******************************/
    assistant.createSession({
      assistantId: serviceCredentials.assistant.assistantID,
    })
    .then(res => {
      let sessionId = res.result.session_id;

      assistant.message({
        assistantId: serviceCredentials.assistant.assistantID,
        sessionId,
        input: {
          'message_type': 'text',
          'text': msg,
          'options': { 'return_context': true },
        }
      })
      .then(res => {
        let textResponse = res.result.output.generic.find(x => x.response_type === 'text');
        let context = res.result.context.skills['main skill']['user_defined'];
        if (context.best) {
          switch (context.best) {
            case "All":
              makeQuery("term(hotel,count:50).average(enriched_text.sentiment.document.score)")
              .then(results => {
                const [ bestHotel, highestSent ] = findBestHotel(results);
                // console.log(bestHotel, highestSent);
                io.emit('chat message', "The best hotel overall is " + bestHotel.replace(/_/g," ") + " with an average sentiment of " + highestSent.toFixed(2));
              });
              break;
            case "new-york-city":
              makeQuery("filter(city::"+context.best+").term(hotel,count:50).average(enriched_text.sentiment.document.score)")
              .then(results => {
                const [ bestHotel, highestSent ] = findBestHotel(results);
                // console.log(bestHotel, highestSent);
                io.emit('chat message', "The best hotel in New York City is " + bestHotel.replace(/_/g," ") + " with an average sentiment of " + highestSent.toFixed(2));
              });
              break;
            case "san-francisco":

              break;
            case "chicago":

              break;
          } 
        } else if (context.list) {

        } else if (context.hotel) {

        } else {
          io.emit('chat message', "Hotel Bot: " + textResponse.text);
        }
      })
      .catch(err => {
        console.log(err);
      })
      .finally(() => {
        assistant.deleteSession({
          assistantId: serviceCredentials.assistant.assistantID,
          sessionId
        });
      });
    })
    .catch(err => {
      console.log(err);
    });
   });
});

app.get('/', function(req, res){
  res.sendFile('index.html');
});

/*****************************
    Function Definitions
******************************/
function makeQuery(query) {
  return discovery.query({
    environmentId: serviceCredentials.discovery.environmentID,
    collectionId: serviceCredentials.discovery.collectionID,
    aggregation: query
  })
  .then(res => {
    return res.result.results;
  });
}

function findBestHotel(qResults) {
  // Function to find the best hotel
  var highestSent = 0;
  var currentSent;
  var bestHotel;
  for (i = 0; i < qResults.length; i++) {
    currentSent = qResults[i].result_metadata.score;
    if (currentSent > highestSent) {
      highestSent = currentSent;
      bestHotel = qResults[i].hotel;
    }
  }
  return [bestHotel, highestSent];
}
