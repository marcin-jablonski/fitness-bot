const discord = require("discord.js");
const {transports, createLogger, format} = require("winston");
const config = require("./config.json");
const { Pool } = require('pg');
const yn = require("yn");
const moment = require("moment-timezone");

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

      setTimeout(async function() {
        logger.debug("Notifying about training");
        message.channel.send("Hey, training time! @everyone");
        if (trainingLink !== null) {
          message.channel.send(trainingLink);
        }
      }, milisToTraining)

      break;
    default:
      logger.debug("Unrecognized command");
      message.channel.send("Was that meant for me? I can't understand :(");
      break;
  }
});

client.login(process.env.BOT_TOKEN);