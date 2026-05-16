import {
  Client,
  GatewayIntentBits,
  Interaction,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  ButtonInteraction,
} from "discord.js";
import { logger } from "../lib/logger.js";
import { deployCommands } from "./deploy-commands.js";
import { initializeSoundCloud } from "./player.js";
import { getOrCreatePlayer } from "./manager.js";
import { PANEL_ID_PREFIX } from "./panel.js";
import * as play from "./commands/play.js";
import * as pause from "./commands/pause.js";
import * as resume from "./commands/resume.js";
import * as skip from "./commands/skip.js";
import * as stop from "./commands/stop.js";
import * as volume from "./commands/volume.js";
import * as queue from "./commands/queue.js";
import * as loop from "./commands/loop.js";
import * as shuffle from "./commands/shuffle.js";
import * as nowplaying from "./commands/nowplaying.js";
import * as remove from "./commands/remove.js";
import * as playlist from "./commands/playlist.js";

type Command = {
  data: { name: string };
  execute: (i: ChatInputCommandInteraction) => Promise<unknown>;
  autocomplete?: (i: AutocompleteInteraction) => Promise<unknown>;
};

const commandMap = new Map<string, Command>();
for (const cmd of [play, pause, resume, skip, stop, volume, queue, loop, shuffle, nowplaying, remove, playlist]) {
  commandMap.set(cmd.data.name, cmd as Command);
}

async function handlePanelButton(interaction: ButtonInteraction): Promise<void> {
  const id = interaction.customId;
  const withoutPrefix = id.slice(PANEL_ID_PREFIX.length);
  const underscoreIdx = withoutPrefix.indexOf("_");
  if (underscoreIdx === -1) return;

  const action = withoutPrefix.slice(0, underscoreIdx);
  const guildId = withoutPrefix.slice(underscoreIdx + 1);

  if (!guildId || guildId !== interaction.guildId) return;

  const player = getOrCreatePlayer(guildId);

  await interaction.deferUpdate();

  switch (action) {
    case "pause": {
      if (player.paused) {
        player.resume();
      } else {
        player.pause();
      }
      break;
    }
    case "skip": {
      player.skip();
      break;
    }
    case "stop": {
      player.stop();
      break;
    }
    case "voldown": {
      player.setVolume(Math.max(0, player.volume - 10));
      break;
    }
    case "volup": {
      player.setVolume(Math.min(200, player.volume + 10));
      break;
    }
    default:
      break;
  }
}

export async function startBot() {
  if (process.env["DISABLE_BOT"] === "true") {
    logger.info("DISABLE_BOT=true — бот не запущен на этом окружении.");
    return;
  }

  const token = process.env["DISCORD_TOKEN"];
  if (!token) {
    logger.warn("DISCORD_TOKEN не задан — бот не запущен.");
    return;
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildMessages,
    ],
  });

  client.once("ready", async (c) => {
    logger.info(`Бот запущен как ${c.user.tag}`);
    await initializeSoundCloud();
    try {
      await deployCommands(token, c.user.id);
    } catch (err) {
      logger.error({ err }, "Не удалось зарегистрировать команды");
    }
  });

  client.on("interactionCreate", async (interaction: Interaction) => {
    if (interaction.isButton()) {
      if (interaction.customId.startsWith(PANEL_ID_PREFIX)) {
        try {
          await handlePanelButton(interaction as ButtonInteraction);
        } catch (err) {
          logger.error({ err }, "Ошибка обработки кнопки панели");
        }
      }
      return;
    }

    if (interaction.isAutocomplete()) {
      const command = commandMap.get(interaction.commandName);
      if (command?.autocomplete) {
        try {
          await command.autocomplete(interaction as AutocompleteInteraction);
        } catch (err) {
          logger.error({ err, cmd: interaction.commandName }, "Ошибка autocomplete");
          try { await (interaction as AutocompleteInteraction).respond([]); } catch { /* ignore */ }
        }
      }
      return;
    }

    if (!interaction.isChatInputCommand()) return;

    const command = commandMap.get(interaction.commandName);
    if (!command) return;

    try {
      await command.execute(interaction);
    } catch (err) {
      logger.error({ err, cmd: interaction.commandName }, "Ошибка выполнения команды");
      const msg = "❌ Произошла ошибка при выполнении команды.";
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: msg, ephemeral: true });
      } else {
        await interaction.reply({ content: msg, ephemeral: true });
      }
    }
  });

  process.on("unhandledRejection", (err) => {
    logger.error({ err }, "Unhandled promise rejection");
  });

  process.on("uncaughtException", (err) => {
    logger.error({ err }, "Uncaught exception");
  });

  await client.login(token);
}
