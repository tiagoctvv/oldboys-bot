require("dotenv").config();

// ====== SERVIDOR (FIX RENDER) ======
const express = require("express");
const app = express();

app.get("/", (req, res) => {
  res.send("Bot OLD BOYS online ✅");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Servidor web ativo na porta " + PORT);
});

// ====== DISCORD ======
const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Events,
  EmbedBuilder,
  StringSelectMenuBuilder
} = require("discord.js");

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const MAX_PLAYERS = 44;

// ====== ESTADO ======
let players = [];
let waitingList = [];
let captains = [];
let positions = {};

// ====== FUNÇÕES ======
function shuffle(array) {
  return [...array].sort(() => Math.random() - 0.5);
}

function createTeams() {
  let list = [...players];

  list.sort((a, b) => {
    const posA = positions[a]?.[0] || "ZZ";
    const posB = positions[b]?.[0] || "ZZ";
    return posA.localeCompare(posB);
  });

  list = shuffle(list);

  const teams = [[], [], [], []];

  list.forEach((p, i) => {
    teams[i % 4].push(p);
  });

  return teams;
}

// ====== EMBED ======
function buildEmbed() {
  return new EmbedBuilder()
    .setTitle("🏆 OLD BOYS DRAFT")
    .setDescription(
      `**Jogadores:** ${players.length}/44\n` +
      `**Capitães:** ${captains.length}/4\n` +
      `**Lista de espera:** ${waitingList.length}`
    )
    .addFields(
      {
        name: "Participantes",
        value: players.map(id => `<@${id}>`).join("\n") || "Nenhum"
      },
      {
        name: "Capitães",
        value: captains.map(id => `<@${id}>`).join("\n") || "Nenhum"
      }
    );
}

// ====== BOTÕES ======
function mainButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("join").setLabel("Entrar").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("leave").setLabel("Sair").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("more").setLabel("Mais opções").setStyle(ButtonStyle.Secondary)
  );
}

function extraButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("position").setLabel("Posições").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("captain").setLabel("Ser Capitão").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("random_captain").setLabel("Sortear Capitães").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("draw").setLabel("Sortear Equipas").setStyle(ButtonStyle.Danger)
  );
}

function positionMenu() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("select_pos")
      .setPlaceholder("Escolhe até 3 posições")
      .setMinValues(1)
      .setMaxValues(3)
      .addOptions(
        ["GR", "DC", "ALA", "MDC", "MC", "MCO", "PL"].map(p => ({
          label: p,
          value: p
        }))
      )
  );
}

// ====== INTERAÇÕES ======
client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === "draft") {
      await interaction.reply({
        embeds: [buildEmbed()],
        components: [mainButtons()]
      });
    }
  }

  if (interaction.isButton()) {
    const id = interaction.user.id;

    if (interaction.customId === "join") {
      if (players.includes(id) || waitingList.includes(id)) {
        return interaction.reply({ content: "Já estás inscrito.", ephemeral: true });
      }

      if (players.length < MAX_PLAYERS) {
        players.push(id);
      } else {
        waitingList.push(id);
      }

      await interaction.update({
        embeds: [buildEmbed()],
        components: [mainButtons()]
      });
    }

    if (interaction.customId === "leave") {
      players = players.filter(p => p !== id);
      waitingList = waitingList.filter(p => p !== id);
      captains = captains.filter(p => p !== id);

      if (players.length < MAX_PLAYERS && waitingList.length > 0) {
        players.push(waitingList.shift());
      }

      await interaction.update({
        embeds: [buildEmbed()],
        components: [mainButtons()]
      });
    }

    if (interaction.customId === "more") {
      await interaction.reply({
        content: "Opções:",
        components: [extraButtons()],
        ephemeral: true
      });
    }

    if (interaction.customId === "position") {
      if (!players.includes(id)) {
        return interaction.reply({ content: "Primeiro entra no draft.", ephemeral: true });
      }

      await interaction.reply({
        content: "Escolhe posições:",
        components: [positionMenu()],
        ephemeral: true
      });
    }

    if (interaction.customId === "captain") {
      if (!players.includes(id)) {
        return interaction.reply({ content: "Tens de estar no draft.", ephemeral: true });
      }

      if (captains.length >= 4) {
        return interaction.reply({ content: "Já existem 4 capitães.", ephemeral: true });
      }

      if (!captains.includes(id)) captains.push(id);

      await interaction.update({
        embeds: [buildEmbed()],
        components: [mainButtons()]
      });
    }

    if (interaction.customId === "random_captain") {
      captains = shuffle(players).slice(0, 4);

      await interaction.update({
        embeds: [buildEmbed()],
        components: [mainButtons()]
      });
    }

    if (interaction.customId === "draw") {
      if (players.length < 44) {
        return interaction.reply({ content: "Precisas de 44 jogadores.", ephemeral: true });
      }

      const teams = createTeams();

      const embed = new EmbedBuilder()
        .setTitle("⚽ Equipas")
        .addFields(
          teams.map((team, i) => ({
            name: `Equipa ${i + 1}`,
            value: team.map(p => `<@${p}>`).join("\n")
          }))
        );

      await interaction.reply({ embeds: [embed] });
    }
  }

  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === "select_pos") {
      positions[interaction.user.id] = interaction.values;

      await interaction.update({
        content: "Posições guardadas!",
        components: []
      });
    }
  }
});

client.login(process.env.TOKEN);
