const discord = require("discord.js");
const {transports, createLogger, format} = require("winston");
const config = require("./config.json");
const { Pool } = require('pg');
const yn = require("yn");
const moment = require("moment-timezone");
const _ = require("lodash");

require("dotenv").config();

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: yn(process.env.DATABASE_SSL) ? {
    rejectUnauthorized: false
  } : false
})

const logger = createLogger({
  format: format.combine(
      format.timestamp(),
      format.json(),
      format.colorize()
  ),
  transports: [
      new transports.Console(),
  ]
});

logger.level = 'debug';

var queuedTrainings = [];

async function notifyAboutTraining(trainingId) {
  logger.debug("Notifying about training");

  db.query("SELECT * FROM trainings WHERE id = $1", [trainingId])
    .then(res => {
      client.channels
        .fetch(res.rows[0].channel)
        .then(channel => {
          channel.send("Hey, training time! @everyone");

          logger.debug("Training link: " + res.rows[0].link);
    
          if (res.rows[0].link !== null && res.rows[0].link !== undefined) {
            channel.send(res.rows[0].link);
          }
          
          _.remove(queuedTrainings, (item) => item === trainingId);
          db.query("UPDATE trainings SET completed = TRUE WHERE id = $1", [trainingId]).catch(err => { throw err; });
        });      
    })
    .catch(err => { throw err; });
}

const client = new discord.Client();

client.once('ready', () => {
  logger.info('Connected');
  logger.info('Logged in as: ' + client.user);
});

client.on('message', async (message) => {
  if (!message.content.startsWith(config.prefix) || message.author.bot) return;

  logger.debug("Received message: " + message.content);

  const args = message.content.split(/ +/);
  args.shift();
  const cmd = args.shift().toLowerCase();

  switch(cmd) {
    case "timezone":
      if (args.length !== 1) throw new Error("Wrong arguments");

      db.query("INSERT INTO settings(key, value) VALUES ('timezone', $1) ON CONFLICT (key) DO UPDATE SET value = $1;", args, (err) => {
        if (err) throw err;
      });
      
      break;
    case 'training':

      const linkIndex = args.findIndex((item) => item === "link");

      var trainingTime;
      var trainingLink;

      if (linkIndex !== -1) {
        trainingTime = args.slice(0, linkIndex).join(" ");
        trainingLink = args[linkIndex + 1];
      } else {
        trainingTime = args.join(" ");
      }

      const hasDate = !(/^([0-2]?[0-9])(:([0-5][0-9]))?(:([0-5][0-9]))?$/.test(trainingTime));

      logger.debug("Is time with date: " + hasDate);

      var trainingDate;
      var milisToTraining;
      var timezone = "UTC";
      
      await db.query("SELECT value FROM settings WHERE key = 'timezone';")
        .then(res => {
          if (res.rows.length !== 0 && res.rows[0].value !== null) 
            timezone = res.rows[0].value;
        })
        .catch(err => { throw err; });

      logger.debug("Timezone: " + timezone);

      if (hasDate) {
        trainingDate = moment.tz(trainingTime, timezone);

        const now = moment();

        milisToTraining = trainingDate.diff(now);

        logger.debug("Milis to training: " + milisToTraining);

        if (milisToTraining < 0) {
          logger.debug("Date is in the past, send message")
          break;
        }
      } else {
        trainingDate = moment.tz(moment().format("DD/MM/YYYY") + " " + trainingTime, "DD/MM/YYYY HH:mm:ss", timezone);

        const now = moment();

        if (trainingDate < now) {
          trainingDate = trainingDate.date(trainingDate.date() + 1); // it's after this hour today, try tomorrow.
        }

        milisToTraining = trainingDate.diff(now);
      }

      logger.debug("Training date: " + trainingDate.toString());

      logger.debug("Milis to training: " + milisToTraining);

      message.channel.send("Training set for " + trainingDate.toString());

      db.query("INSERT INTO trainings(channel, date, link) VALUES ($1, $2, $3) RETURNING *;", [message.channel.id, trainingDate, trainingLink])
        .then(res => {
          if (trainingDate < moment().startOf("hour").hour(moment().startOf("hour").hour() + 1)) {
          logger.debug("Training starts within current hour, starting timeout");

          queuedTrainings.push(res.rows[0].id);
          setTimeout(notifyAboutTraining.bind(null, res.rows[0].id), milisToTraining)
        }
        })
        .catch(err => { throw err; });

      break;
    default:
      logger.debug("Unrecognized command");
      message.channel.send("Was that meant for me? I can't understand :(");
      break;
  }
});

client.login(process.env.BOT_TOKEN);

const nextFullHour = moment().startOf("hour").hour(moment().startOf("hour").hour() + 1);

setTimeout(() => {
  setInterval(() => {
    db.query("SELECT * FROM trainings WHERE completed = FALSE")
      .then(res => {
        res.rows
          .filter(
            (item) => (item.date <= moment().startOf("hour").hour(moment().startOf("hour").hour() + 1)) && 
            (queuedTrainings.findIndex((qTrainingId) => qTrainingId === item.id) === -1)
          )
          .forEach(training => {
            logger.debug("Queueing training: " + JSON.stringify(training));
            queuedTrainings.push(training.id);
            const milisToTraining = moment(training.date).diff(moment());
            setTimeout(notifyAboutTraining.bind(null, training.id), milisToTraining);
          })
      })
  }, 1000 * 60 * 60)
}, nextFullHour.diff(moment()))

db.query("SELECT * FROM trainings WHERE completed = FALSE")
  .then(res => {
    res.rows
      .filter((item) => item.date <= nextFullHour)
      .forEach(training => {
        logger.debug("Queueing training: " + JSON.stringify(training));
        queuedTrainings.push(training.id);
        const milisToTraining = moment(training.date).diff(moment());
        setTimeout(notifyAboutTraining.bind(null, training.id), milisToTraining);
      })
  })