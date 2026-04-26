require("dotenv").config();
const express = require("express");
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  StringSelectMenuBuilder
} = require("discord.js");

const app = express();

app.get("/", (req, res) => {
  res.send("Bot OLD BOYS esta online e funcional.");
});

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => {
  console.log(`Servidor de monitorizacao pronto na porta ${PORT}`);
});

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

if (!TOKEN || !CLIENT_ID) {
  console.error("Erro: faltam TOKEN ou CLIENT_ID nas variaveis de ambiente.");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent
  ]
});

const TEAM_KEYS = ["equipa1", "equipa2", "equipa3", "equipa4"];
const TEAM_LABELS = {
  equipa1: "Equipa 1",
  equipa2: "Equipa 2",
  equipa3: "Equipa 3",
  equipa4: "Equipa 4"
};

const POSITION_DEFINITIONS = {
  GR: { label: "GR", family: "GR" },
  DC: { label: "DC", family: "DC" },
  ALA: { label: "ALA", family: "ALA" },
  MDC: { label: "MDC", family: "MID" },
  MC: { label: "MC", family: "MID" },
  MCO: { label: "MCO", family: "MCO" },
  PL: { label: "PL", family: "PL" }
};

const VALID_POSITIONS = Object.keys(POSITION_DEFINITIONS);
const MID_POSITIONS = ["MC", "MDC"];

const TEAM_ROLE_REQUIREMENTS = {
  GR: 1,
  DC: 3,
  ALA: 2,
  MID: 2,
  MCO: 1,
  PL: 2
};

const CONFIG = {
  nome: "OLD BOYS Tournament",
  data: "18 de abril de 2026 as 21:30",
  plataforma: "Crossplay",
  tipo: "Pro Clubs Tournament",
  formato: "4 equipas de 11",
  maxJogadores: 44,
  maxCapitoes: 4,
  jogadoresPorEquipa: 11,
  maxPosicoesPorJogador: 3,
  prioridade: "@STAR - PREMIUM",
  regras: "Sem ALT abuse",
  restricoes: "Aplicam-se as regras oficiais do torneio",
  exigirPosicoesAntesDoSorteio: true,
  exigir44ParaSortear: true
};

const DEFAULT_TEAM_SLOT_ORDER = [
  { role: "GR", label: "GR" },
  { role: "DC", label: "DC 1" },
  { role: "DC", label: "DC 2" },
  { role: "DC", label: "DC 3" },
  { role: "ALA", label: "ALA 1" },
  { role: "ALA", label: "ALA 2" },
  { role: "MID", label: "MC/MDC 1" },
  { role: "MID", label: "MC/MDC 2" },
  { role: "MCO", label: "MCO" },
  { role: "PL", label: "PL 1" },
  { role: "PL", label: "PL 2" }
];

function createInitialState() {
  return {
    participantes: [],
    listaEspera: [],
    jogadores: {},
    capitoes: [],
    equipas: createEmptyTeams(),
    sorteioFeito: false,
    canalId: null,
    mensagemPrincipalId: null,
    ultimoRelatorio: null
  };
}

function createEmptyTeams() {
  const teams = {};
  TEAM_KEYS.forEach((teamKey) => {
    teams[teamKey] = {
      slots: DEFAULT_TEAM_SLOT_ORDER.map((slot, index) => ({
        id: `${teamKey}_slot_${index + 1}`,
        role: slot.role,
        label: slot.label,
        playerId: null,
        lockedCaptain: false
      })),
      banco: []
    };
  });
  return teams;
}

let estado = createInitialState();

function nowIso() {
  return new Date().toISOString();
}

function randomInt(max) {
  return Math.floor(Math.random() * max);
}

function shuffle(array) {
  const copy = [...array];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function normalizePosition(position) {
  if (!position) {
    return null;
  }

  const normalized = String(position).trim().toUpperCase();
  return VALID_POSITIONS.includes(normalized) ? normalized : null;
}

function normalizePositions(list) {
  if (!Array.isArray(list)) {
    return [];
  }

  const seen = new Set();
  const normalized = [];

  list.forEach((position) => {
    const valid = normalizePosition(position);
    if (valid && !seen.has(valid)) {
      seen.add(valid);
      normalized.push(valid);
    }
  });

  return normalized.slice(0, CONFIG.maxPosicoesPorJogador);
}

function ensurePlayerRecord(user) {
  const userId = typeof user === "string" ? user : user.id;

  if (!estado.jogadores[userId]) {
    estado.jogadores[userId] = {
      id: userId,
      username: typeof user === "string" ? `User ${userId}` : user.username,
      displayName: typeof user === "string" ? `User ${userId}` : user.globalName || user.username,
      positions: [],
      rating: null,
      isCaptain: false,
      joinedAt: nowIso(),
      updatedAt: nowIso(),
      lastDrawRole: null,
      drawHistory: []
    };
  } else if (typeof user !== "string") {
    estado.jogadores[userId].username = user.username;
    estado.jogadores[userId].displayName = user.globalName || user.username;
    estado.jogadores[userId].updatedAt = nowIso();
  }

  return estado.jogadores[userId];
}

function getPlayer(userId) {
  return estado.jogadores[userId] || null;
}

function getMention(userId) {
  return `<@${userId}>`;
}

function getPlayerLabel(userId) {
  const player = getPlayer(userId);
  return player ? `${getMention(userId)} (${player.displayName})` : getMention(userId);
}

function resetTeams() {
  estado.equipas = createEmptyTeams();
  estado.sorteioFeito = false;
  estado.ultimoRelatorio = null;
}

function fullReset() {
  estado = createInitialState();
}

function isRegistered(userId) {
  return estado.participantes.includes(userId);
}

function isWaiting(userId) {
  return estado.listaEspera.includes(userId);
}

function isCaptain(userId) {
  return estado.capitoes.includes(userId);
}

function registerPlayer(user) {
  const userId = user.id;
  ensurePlayerRecord(user);

  if (isRegistered(userId) || isWaiting(userId)) {
    return {
      ok: false,
      message: "Ja estas inscrito no torneio ou na lista de espera."
    };
  }

  if (estado.participantes.length < CONFIG.maxJogadores) {
    estado.participantes.push(userId);
    resetTeams();
    return {
      ok: true,
      message: "Entraste no torneio com sucesso.",
      waitingList: false
    };
  }

  estado.listaEspera.push(userId);
  return {
    ok: true,
    message: "O torneio ja esta cheio. Entraste na lista de espera.",
    waitingList: true
  };
}

function removePlayerCompletely(userId) {
  estado.participantes = estado.participantes.filter((id) => id !== userId);
  estado.listaEspera = estado.listaEspera.filter((id) => id !== userId);
  estado.capitoes = estado.capitoes.filter((id) => id !== userId);

  const player = getPlayer(userId);
  if (player) {
    player.isCaptain = false;
    player.lastDrawRole = null;
  }

  TEAM_KEYS.forEach((teamKey) => {
    estado.equipas[teamKey].slots.forEach((slot) => {
      if (slot.playerId === userId) {
        slot.playerId = null;
        slot.lockedCaptain = false;
      }
    });

    estado.equipas[teamKey].banco = estado.equipas[teamKey].banco.filter((id) => id !== userId);
  });

  resetTeams();
}

function promoteFromWaitingList() {
  const promoted = [];

  while (estado.participantes.length < CONFIG.maxJogadores && estado.listaEspera.length > 0) {
    const nextId = estado.listaEspera.shift();
    estado.participantes.push(nextId);
    promoted.push(nextId);
  }

  if (promoted.length > 0) {
    resetTeams();
  }

  return promoted;
}

function setCaptain(userId) {
  if (!isRegistered(userId)) {
    return {
      ok: false,
      message: "Inscreve-te primeiro antes de te tornares capitao."
    };
  }

  if (isCaptain(userId)) {
    return {
      ok: false,
      message: "Ja es capitao."
    };
  }

  if (estado.capitoes.length >= CONFIG.maxCapitoes) {
    return {
      ok: false,
      message: "Ja existem 4 capitaes definidos."
    };
  }

  estado.capitoes.push(userId);
  const player = getPlayer(userId);
  if (player) {
    player.isCaptain = true;
  }
  resetTeams();

  return {
    ok: true,
    message: "Agora es capitao."
  };
}

function unsetCaptain(userId) {
  if (!isCaptain(userId)) {
    return {
      ok: false,
      message: "Nao eras capitao."
    };
  }

  estado.capitoes = estado.capitoes.filter((id) => id !== userId);
  const player = getPlayer(userId);
  if (player) {
    player.isCaptain = false;
  }
  resetTeams();

  return {
    ok: true,
    message: "Ja nao es capitao."
  };
}

function setPlayerPositions(userId, positions) {
  const player = getPlayer(userId);
  if (!player) {
    return {
      ok: false,
      message: "Primeiro tens de estar inscrito."
    };
  }

  const normalized = normalizePositions(positions);
  if (normalized.length === 0) {
    return {
      ok: false,
      message: "Escolhe pelo menos uma posicao valida."
    };
  }

  player.positions = normalized;
  player.updatedAt = nowIso();
  resetTeams();

  return {
    ok: true,
    message: `Posicoes guardadas: ${normalized.join(" / ")}`
  };
}

function formatPositionList(positions) {
  return positions && positions.length > 0 ? positions.join("/") : "Sem posicao";
}

function countRegisteredByExactPosition() {
  const counters = {};
  VALID_POSITIONS.forEach((position) => {
    counters[position] = 0;
  });

  estado.participantes.forEach((userId) => {
    const player = getPlayer(userId);
    if (!player) {
      return;
    }

    player.positions.forEach((position) => {
      if (counters[position] !== undefined) {
        counters[position] += 1;
      }
    });
  });

  return counters;
}

function buildPositionSummary() {
  const counts = countRegisteredByExactPosition();
  return VALID_POSITIONS.map((position) => `${position}: ${counts[position]}`).join(" | ");
}

function formatParticipantsByPrimaryPosition() {
  if (estado.participantes.length === 0) {
    return "Ainda nao ha participantes.";
  }

  const groups = {};
  VALID_POSITIONS.forEach((position) => {
    groups[position] = [];
  });
  const withoutPosition = [];

  estado.participantes.forEach((userId) => {
    const player = getPlayer(userId);
    const primary = player && player.positions.length > 0 ? player.positions[0] : null;

    if (!player || !primary) {
      withoutPosition.push(userId);
      return;
    }

    groups[primary].push(userId);
  });

  const blocks = VALID_POSITIONS.map((position) => {
    if (groups[position].length === 0) {
      return "";
    }

    const lines = groups[position].map((userId, index) => {
      const player = getPlayer(userId);
      const captainMark = isCaptain(userId) ? " [C]" : "";
      return `${index + 1}. ${getMention(userId)} - ${formatPositionList(player.positions)}${captainMark}`;
    });

    return `**${position}**\n${lines.join("\n")}`;
  }).filter(Boolean);

  if (withoutPosition.length > 0) {
    const lines = withoutPosition.map((userId, index) => {
      const captainMark = isCaptain(userId) ? " [C]" : "";
      return `${index + 1}. ${getMention(userId)} - Sem posicao${captainMark}`;
    });
    blocks.push(`**Sem posicao**\n${lines.join("\n")}`);
  }

  return blocks.join("\n\n");
}

function formatWaitingList() {
  if (estado.listaEspera.length === 0) {
    return "Ninguem em espera.";
  }

  return estado.listaEspera
    .map((userId, index) => `${index + 1}. ${getPlayerLabel(userId)}`)
    .join("\n");
}

function getRoleNeededCountsForAllTeams() {
  return {
    GR: TEAM_ROLE_REQUIREMENTS.GR * TEAM_KEYS.length,
    DC: TEAM_ROLE_REQUIREMENTS.DC * TEAM_KEYS.length,
    ALA: TEAM_ROLE_REQUIREMENTS.ALA * TEAM_KEYS.length,
    MID: TEAM_ROLE_REQUIREMENTS.MID * TEAM_KEYS.length,
    MCO: TEAM_ROLE_REQUIREMENTS.MCO * TEAM_KEYS.length,
    PL: TEAM_ROLE_REQUIREMENTS.PL * TEAM_KEYS.length
  };
}

function countCandidatesForDrawRoles() {
  const counts = {
    GR: 0,
    DC: 0,
    ALA: 0,
    MID: 0,
    MCO: 0,
    PL: 0
  };

  estado.participantes.forEach((userId) => {
    const player = getPlayer(userId);
    if (!player) {
      return;
    }

    const families = new Set(player.positions.map((position) => POSITION_DEFINITIONS[position].family));
    families.forEach((family) => {
      counts[family] += 1;
    });
  });

  return counts;
}

function describeRoleShortages() {
  const required = getRoleNeededCountsForAllTeams();
  const available = countCandidatesForDrawRoles();
  const shortages = [];

  Object.keys(required).forEach((role) => {
    if (available[role] < required[role]) {
      shortages.push(`${role}: faltam ${required[role] - available[role]}`);
    }
  });

  return shortages;
}

function validateTournamentForDraw() {
  const issues = [];

  if (CONFIG.exigir44ParaSortear && estado.participantes.length !== CONFIG.maxJogadores) {
    issues.push(`Sao precisos exatamente ${CONFIG.maxJogadores} inscritos para o sorteio.`);
  }

  if (estado.capitoes.length !== CONFIG.maxCapitoes) {
    issues.push(`Sao precisos exatamente ${CONFIG.maxCapitoes} capitaes.`);
  }

  if (CONFIG.exigirPosicoesAntesDoSorteio) {
    const missing = estado.participantes.filter((userId) => {
      const player = getPlayer(userId);
      return !player || player.positions.length === 0;
    });

    if (missing.length > 0) {
      issues.push(`${missing.length} jogador(es) ainda nao escolheram posicoes.`);
    }
  }

  const shortages = describeRoleShortages();
  if (shortages.length > 0) {
    issues.push(`Distribuicao insuficiente por funcao: ${shortages.join(" | ")}`);
  }

  return {
    ok: issues.length === 0,
    issues
  };
}

function createGlobalSlots() {
  const slots = [];

  TEAM_KEYS.forEach((teamKey) => {
    estado.equipas[teamKey].slots.forEach((slot) => {
      slots.push({
        teamKey,
        slotId: slot.id,
        role: slot.role,
        label: slot.label
      });
    });
  });

  return slots;
}

function getAssignableRoles(player) {
  return new Set(player.positions.map((position) => POSITION_DEFINITIONS[position].family));
}

function canPlayerFillRole(player, role) {
  if (!player || !Array.isArray(player.positions)) {
    return false;
  }

  if (role === "MID") {
    return player.positions.some((position) => MID_POSITIONS.includes(position));
  }

  return player.positions.includes(role);
}

function getCompatibleSlotsForPlayer(player, slots) {
  return slots.filter((slot) => canPlayerFillRole(player, slot.role));
}

function getSlotObject(teamKey, slotId) {
  return estado.equipas[teamKey].slots.find((slot) => slot.id === slotId) || null;
}

function assignPlayerToSlot(teamKey, slotId, userId, lockedCaptain = false) {
  const slot = getSlotObject(teamKey, slotId);
  if (!slot) {
    return false;
  }

  slot.playerId = userId;
  slot.lockedCaptain = lockedCaptain;

  const player = getPlayer(userId);
  if (player) {
    player.lastDrawRole = slot.role;
    player.drawHistory.push({
      at: nowIso(),
      teamKey,
      slotId,
      role: slot.role
    });
  }

  return true;
}

function chooseBestCaptainSlot(teamKey, userId) {
  const player = getPlayer(userId);
  if (!player) {
    return null;
  }

  const openSlots = estado.equipas[teamKey].slots.filter((slot) => !slot.playerId);
  const preferred = getCompatibleSlotsForPlayer(player, openSlots);
  if (preferred.length > 0) {
    return preferred[0];
  }

  return openSlots[0] || null;
}

function preassignCaptains() {
  const assignments = [];

  TEAM_KEYS.forEach((teamKey, index) => {
    const captainId = estado.capitoes[index];
    if (!captainId) {
      return;
    }

    const slot = chooseBestCaptainSlot(teamKey, captainId);
    if (!slot) {
      return;
    }

    assignPlayerToSlot(teamKey, slot.id, captainId, true);
    assignments.push({
      teamKey,
      slotId: slot.id,
      userId: captainId,
      role: slot.role
    });
  });

  return assignments;
}

function createMatchingGraph(players, slots) {
  const graph = new Map();

  players.forEach((player) => {
    const compatible = getCompatibleSlotsForPlayer(player, slots);
    const shuffled = shuffle(compatible)
      .sort((left, right) => {
        if (left.teamKey === right.teamKey) {
          return left.label.localeCompare(right.label);
        }
        return left.teamKey.localeCompare(right.teamKey);
      })
      .map((slot) => slot.slotId);

    graph.set(player.id, shuffled);
  });

  return graph;
}

function findAugmentingPath(playerId, graph, visitedSlots, slotToPlayer, playerToSlot) {
  const possibleSlots = graph.get(playerId) || [];

  for (const slotId of possibleSlots) {
    if (visitedSlots.has(slotId)) {
      continue;
    }

    visitedSlots.add(slotId);
    const existingPlayerId = slotToPlayer.get(slotId);

    if (!existingPlayerId || findAugmentingPath(existingPlayerId, graph, visitedSlots, slotToPlayer, playerToSlot)) {
      slotToPlayer.set(slotId, playerId);
      playerToSlot.set(playerId, slotId);
      return true;
    }
  }

  return false;
}

function runMaximumMatching(players, slots) {
  const graph = createMatchingGraph(players, slots);
  const orderedPlayers = [...players].sort((left, right) => {
    const leftOptions = (graph.get(left.id) || []).length;
    const rightOptions = (graph.get(right.id) || []).length;
    if (leftOptions !== rightOptions) {
      return leftOptions - rightOptions;
    }

    return left.positions.length - right.positions.length;
  });

  const slotToPlayer = new Map();
  const playerToSlot = new Map();

  orderedPlayers.forEach((player) => {
    const visitedSlots = new Set();
    findAugmentingPath(player.id, graph, visitedSlots, slotToPlayer, playerToSlot);
  });

  return {
    slotToPlayer,
    playerToSlot,
    graph
  };
}

function buildDrawDiagnostics(unmatchedPlayers, openSlots) {
  const playersByFlexibility = unmatchedPlayers
    .map((player) => `${player.displayName}: ${formatPositionList(player.positions)}`)
    .join("\n");

  const slotsByNeed = openSlots
    .map((slot) => `${TEAM_LABELS[slot.teamKey]} - ${slot.label} (${slot.role})`)
    .join("\n");

  const roleShortages = describeRoleShortages();

  return {
    playersByFlexibility: playersByFlexibility || "Nenhum",
    slotsByNeed: slotsByNeed || "Nenhum",
    roleShortages: roleShortages.length > 0 ? roleShortages.join(" | ") : "Sem faltas globais detetadas"
  };
}

function formatTeamForDraw(teamKey) {
  const team = estado.equipas[teamKey];
  const lines = team.slots.map((slot) => {
    if (!slot.playerId) {
      return `${slot.label}: [vazio]`;
    }

    const player = getPlayer(slot.playerId);
    const captainMark = slot.lockedCaptain ? " [C]" : "";
    const positions = player ? formatPositionList(player.positions) : "Sem posicao";
    return `${slot.label}: ${getMention(slot.playerId)} - ${positions}${captainMark}`;
  });

  if (team.banco.length > 0) {
    lines.push("");
    lines.push(`Banco: ${team.banco.map((userId) => getMention(userId)).join(", ")}`);
  }

  return lines.join("\n");
}

function formatCaptainList() {
  if (estado.capitoes.length === 0) {
    return "Nenhum capitao definido.";
  }

  return estado.capitoes
    .map((userId, index) => `${index + 1}. ${getPlayerLabel(userId)}`)
    .join("\n");
}

function buildTournamentEmbed() {
  return new EmbedBuilder()
    .setColor(0xD4AF37)
    .setTitle(`OLD BOYS | ${CONFIG.nome}`)
    .setDescription(`**Participantes por posicao**\n${formatParticipantsByPrimaryPosition()}`)
    .addFields(
      { name: "Data", value: CONFIG.data, inline: false },
      { name: "Plataforma", value: CONFIG.plataforma, inline: true },
      { name: "Tipo", value: CONFIG.tipo, inline: true },
      { name: "Formato", value: CONFIG.formato, inline: true },
      { name: "Inscritos", value: `${estado.participantes.length}/${CONFIG.maxJogadores}`, inline: true },
      { name: "Capitaes", value: `${estado.capitoes.length}/${CONFIG.maxCapitoes}`, inline: true },
      { name: "Lista de espera", value: `${estado.listaEspera.length}`, inline: true },
      { name: "Resumo de posicoes", value: buildPositionSummary(), inline: false },
      { name: "Capitaes atuais", value: formatCaptainList(), inline: false },
      { name: "Lista de espera", value: formatWaitingList(), inline: false }
    )
    .setFooter({
      text: "Bot OLD BOYS | sorteio por posicoes e validacoes inteligentes"
    });
}

function buildMainButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("entrar").setLabel("Entrar").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("sair").setLabel("Sair").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("mais_opcoes").setLabel("Mais opcoes").setStyle(ButtonStyle.Secondary)
  );
}

function buildExtraButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("abrir_posicoes").setLabel("Posicoes").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("ser_capitao").setLabel("Ser capitao").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("remover_capitao").setLabel("Remover capitao").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("fazer_sorteio").setLabel("Fazer sorteio").setStyle(ButtonStyle.Danger)
  );
}

function buildPositionsMenu() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("sel_pos")
      .setPlaceholder("Escolhe ate 3 posicoes")
      .setMinValues(1)
      .setMaxValues(3)
      .addOptions(
        VALID_POSITIONS.map((position) => ({
          label: position,
          value: position,
          description: position === "MC" || position === "MDC"
            ? "Conta para as 2 vagas MC/MDC"
            : `Posicao ${position}`
        }))
      )
  );
}

function buildValidationEmbed() {
  const validation = validateTournamentForDraw();
  return new EmbedBuilder()
    .setColor(validation.ok ? 0x2ECC71 : 0xE74C3C)
    .setTitle("Estado de validacao do sorteio")
    .setDescription(
      validation.ok
        ? "Tudo pronto para sortear as 4 equipas com 11 jogadores."
        : validation.issues.map((issue, index) => `${index + 1}. ${issue}`).join("\n")
    )
    .addFields(
      {
        name: "Necessidades globais por funcao",
        value: "GR: 4 | DC: 12 | ALA: 8 | MID: 8 | MCO: 4 | PL: 8",
        inline: false
      },
      {
        name: "Candidatos por funcao",
        value: Object.entries(countCandidatesForDrawRoles())
          .map(([role, value]) => `${role}: ${value}`)
          .join(" | "),
        inline: false
      }
    );
}

function buildDrawResultEmbed(report) {
  const embed = new EmbedBuilder()
    .setColor(report.success ? 0x27AE60 : 0xC0392B)
    .setTitle(report.success ? "Resultado do sorteio" : "Sorteio bloqueado")
    .setDescription(report.summary)
    .addFields(
      { name: "Equipa 1", value: formatTeamForDraw("equipa1"), inline: false },
      { name: "Equipa 2", value: formatTeamForDraw("equipa2"), inline: false },
      { name: "Equipa 3", value: formatTeamForDraw("equipa3"), inline: false },
      { name: "Equipa 4", value: formatTeamForDraw("equipa4"), inline: false }
    )
    .setFooter({
      text: report.success
        ? "Sorteio equilibrado por funcao"
        : "Corrige os problemas indicados antes de repetir"
    });

  if (!report.success && report.diagnostics) {
    embed.addFields(
      {
        name: "Jogadores sem encaixe",
        value: report.diagnostics.playersByFlexibility,
        inline: false
      },
      {
        name: "Vagas por preencher",
        value: report.diagnostics.slotsByNeed,
        inline: false
      },
      {
        name: "Diagnostico",
        value: report.diagnostics.roleShortages,
        inline: false
      }
    );
  }

  return embed;
}

function buildStateSnapshotEmbed() {
  const validation = validateTournamentForDraw();
  return new EmbedBuilder()
    .setColor(0x3498DB)
    .setTitle("Snapshot do torneio")
    .setDescription(validation.ok ? "Pronto para sortear." : "Ainda ha bloqueios para o sorteio.")
    .addFields(
      { name: "Inscritos", value: `${estado.participantes.length}`, inline: true },
      { name: "Capitaes", value: `${estado.capitoes.length}`, inline: true },
      { name: "Em espera", value: `${estado.listaEspera.length}`, inline: true },
      { name: "Posicoes", value: buildPositionSummary(), inline: false },
      { name: "Validacao", value: validation.ok ? "OK" : validation.issues.join("\n"), inline: false }
    );
}

function assignRemainingPlayersByMatching() {
  const allOpenSlots = createGlobalSlots().filter((slot) => {
    const slotObj = getSlotObject(slot.teamKey, slot.slotId);
    return slotObj && !slotObj.playerId;
  });

  const availablePlayers = estado.participantes
    .filter((userId) => !estado.capitoes.includes(userId))
    .map((userId) => getPlayer(userId))
    .filter(Boolean);

  const matching = runMaximumMatching(availablePlayers, allOpenSlots);
  const matchedPlayers = new Set(matching.playerToSlot.keys());

  matching.playerToSlot.forEach((slotId, userId) => {
    const slotRef = allOpenSlots.find((slot) => slot.slotId === slotId);
    if (!slotRef) {
      return;
    }
    assignPlayerToSlot(slotRef.teamKey, slotRef.slotId, userId, false);
  });

  const unmatchedPlayers = availablePlayers.filter((player) => !matchedPlayers.has(player.id));
  const remainingOpenSlots = createGlobalSlots().filter((slot) => {
    const slotObj = getSlotObject(slot.teamKey, slot.slotId);
    return slotObj && !slotObj.playerId;
  });

  return {
    unmatchedPlayers,
    remainingOpenSlots
  };
}

function performDraw() {
  resetTeams();

  const validation = validateTournamentForDraw();
  if (!validation.ok) {
    return {
      success: false,
      summary: validation.issues.join("\n")
    };
  }

  preassignCaptains();
  const { unmatchedPlayers, remainingOpenSlots } = assignRemainingPlayersByMatching();

  if (unmatchedPlayers.length > 0 || remainingOpenSlots.length > 0) {
    const diagnostics = buildDrawDiagnostics(unmatchedPlayers, remainingOpenSlots);
    estado.sorteioFeito = false;
    estado.ultimoRelatorio = {
      success: false,
      diagnostics
    };

    return {
      success: false,
      summary: "Nao foi possivel preencher as 44 vagas com as combinacoes de posicoes atuais.",
      diagnostics
    };
  }

  estado.sorteioFeito = true;
  const captainSummary = estado.capitoes
    .map((captainId, index) => `${TEAM_LABELS[TEAM_KEYS[index]]}: ${getMention(captainId)}`)
    .join(" | ");

  const report = {
    success: true,
    summary: `Sorteio concluido com sucesso. ${captainSummary}`,
    diagnostics: null
  };

  estado.ultimoRelatorio = report;
  return report;
}

async function refreshMainMessage() {
  if (!estado.canalId || !estado.mensagemPrincipalId) {
    return;
  }

  try {
    const channel = await client.channels.fetch(estado.canalId);
    if (!channel) {
      return;
    }

    const message = await channel.messages.fetch(estado.mensagemPrincipalId);
    if (!message) {
      return;
    }

    await message.edit({
      embeds: [buildTournamentEmbed()],
      components: [buildMainButtons()]
    });
  } catch (error) {
    console.error("Falha ao atualizar a mensagem principal:", error);
  }
}

function buildCommands() {
  return [
    new SlashCommandBuilder()
      .setName("torneio")
      .setDescription("Cria ou atualiza o painel principal do torneio"),
    new SlashCommandBuilder()
      .setName("estado_torneio")
      .setDescription("Mostra o estado de validacao do torneio"),
    new SlashCommandBuilder()
      .setName("reset_torneio")
      .setDescription("Apaga inscricoes, capitaes, lista de espera e equipas")
  ].map((command) => command.toJSON());
}

async function registerSlashCommands() {
  const rest = new REST({ version: "10" }).setToken(TOKEN);
  const route = GUILD_ID
    ? Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID)
    : Routes.applicationCommands(CLIENT_ID);

  await rest.put(route, { body: buildCommands() });
}

async function handleTournamentCommand(interaction) {
  const replyPayload = {
    embeds: [buildTournamentEmbed()],
    components: [buildMainButtons()],
    fetchReply: true
  };

  if (interaction.replied || interaction.deferred) {
    const msg = await interaction.followUp(replyPayload);
    estado.canalId = interaction.channelId;
    estado.mensagemPrincipalId = msg.id;
    return;
  }

  const msg = await interaction.reply(replyPayload);
  estado.canalId = interaction.channelId;
  estado.mensagemPrincipalId = msg.id;
}

async function handleStateCommand(interaction) {
  await interaction.reply({
    embeds: [buildStateSnapshotEmbed(), buildValidationEmbed()],
    ephemeral: true
  });
}

async function handleResetCommand(interaction) {
  fullReset();
  await interaction.reply({
    content: "Estado do torneio reiniciado por completo.",
    ephemeral: true
  });
}

async function handleJoinButton(interaction) {
  const result = registerPlayer(interaction.user);
  await interaction.reply({
    content: result.message,
    ephemeral: true
  });
  await refreshMainMessage();
}

async function handleLeaveButton(interaction) {
  const userId = interaction.user.id;

  if (!isRegistered(userId) && !isWaiting(userId)) {
    await interaction.reply({
      content: "Nao estavas inscrito nem em espera.",
      ephemeral: true
    });
    return;
  }

  removePlayerCompletely(userId);
  const promoted = promoteFromWaitingList();
  const promotionText = promoted.length > 0
    ? ` Entraram da lista de espera: ${promoted.map((id) => getMention(id)).join(", ")}`
    : "";

  await interaction.reply({
    content: `Saida registada.${promotionText}`,
    ephemeral: true
  });
  await refreshMainMessage();
}

async function handleOpenExtraOptions(interaction) {
  await interaction.reply({
    content: "Menu rapido do torneio.",
    embeds: [buildValidationEmbed()],
    components: [buildExtraButtons()],
    ephemeral: true
  });
}

async function handleOpenPositions(interaction) {
  if (!isRegistered(interaction.user.id)) {
    await interaction.reply({
      content: "Inscreve-te primeiro para definires as tuas posicoes.",
      ephemeral: true
    });
    return;
  }

  await interaction.reply({
    content: "Escolhe ate 3 posicoes.",
    components: [buildPositionsMenu()],
    ephemeral: true
  });
}

async function handleSetCaptain(interaction) {
  const result = setCaptain(interaction.user.id);
  await interaction.reply({
    content: result.message,
    ephemeral: true
  });
  await refreshMainMessage();
}

async function handleUnsetCaptain(interaction) {
  const result = unsetCaptain(interaction.user.id);
  await interaction.reply({
    content: result.message,
    ephemeral: true
  });
  await refreshMainMessage();
}

async function handleDraw(interaction) {
  const report = performDraw();
  await interaction.reply({
    embeds: [buildDrawResultEmbed(report)],
    ephemeral: false
  });
  await refreshMainMessage();
}

async function handlePositionsSelect(interaction) {
  const result = setPlayerPositions(interaction.user.id, interaction.values);
  await interaction.update({
    content: result.message,
    components: []
  });
  await refreshMainMessage();
}

client.once(Events.ClientReady, async () => {
  try {
    await registerSlashCommands();
    console.log(`Bot ligado como ${client.user.tag}`);
  } catch (error) {
    console.error("Erro ao registar comandos slash:", error);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === "torneio") {
        await handleTournamentCommand(interaction);
        return;
      }

      if (interaction.commandName === "estado_torneio") {
        await handleStateCommand(interaction);
        return;
      }

      if (interaction.commandName === "reset_torneio") {
        await handleResetCommand(interaction);
        return;
      }
    }

    if (interaction.isButton()) {
      if (interaction.customId === "entrar") {
        await handleJoinButton(interaction);
        return;
      }

      if (interaction.customId === "sair") {
        await handleLeaveButton(interaction);
        return;
      }

      if (interaction.customId === "mais_opcoes") {
        await handleOpenExtraOptions(interaction);
        return;
      }

      if (interaction.customId === "abrir_posicoes") {
        await handleOpenPositions(interaction);
        return;
      }

      if (interaction.customId === "ser_capitao") {
        await handleSetCaptain(interaction);
        return;
      }

      if (interaction.customId === "remover_capitao") {
        await handleUnsetCaptain(interaction);
        return;
      }

      if (interaction.customId === "fazer_sorteio") {
        await handleDraw(interaction);
      }
    }

    if (interaction.isStringSelectMenu() && interaction.customId === "sel_pos") {
      await handlePositionsSelect(interaction);
    }
  } catch (error) {
    console.error("Erro na interacao:", error);

    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "Ocorreu um erro interno ao processar a tua acao.",
        ephemeral: true
      });
    }
  }
});

client.login(TOKEN);
