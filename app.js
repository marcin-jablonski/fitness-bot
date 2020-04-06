const discord = require("discord.js");
const {transports, createLogger, format} = require("winston");
const config = require("./config.json");

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

client.on('message', (message) => {
  if (!message.content.startsWith(config.prefix) || message.author.bot) return;

  logger.debug("Received message: " + message.content);

  const args = message.content.split(/ +/);
  args.shift();
  const cmd = args.shift().toLowerCase();

  switch(cmd) {
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
      var milisToTraining

      if (hasDate) {
        trainingDate = new Date(trainingTime);

        const now = new Date();

        milisToTraining = trainingDate - now;

        if (milisToTraining < 0) {
          logger.debug("Date is in the past, send message")
          break;
        }
      } else {
        trainingDate = new Date(new Date(Date.now()).toDateString().split(',')[0] + " " + trainingTime)

        const now = new Date();

        if (trainingDate < now) {
          trainingDate = new Date(trainingDate.getTime() + 24*60*60*1000); // it's after this hour today, try tomorrow.
        }

        milisToTraining = trainingDate - now;
      }

      logger.debug("Training date: " + trainingDate);

      message.channel.send("Training set for " + trainingDate);

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