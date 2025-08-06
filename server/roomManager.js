class RoomManager {
  constructor() {
    this.rooms = new Map();
  }

  createRoom(roomId) {
    const room = {
      id: roomId,
      players: [],
      gameState: 'waiting', // waiting, playing, voting, results
      currentRound: 1,
      currentLetter: '',
      timeLeft: 60,
      timer: null,
      voting: {},
      roundStartTime: null,
      maxPlayers: 8,
      hostId: null,
      categories: [
        { id: 'nome', label: 'Nome', icon: '👤' },
        { id: 'animal', label: 'Animal', icon: '🐾' },
        { id: 'cor', label: 'Cor', icon: '🎨' },
        { id: 'objeto', label: 'Objeto', icon: '📦' },
        { id: 'filme', label: 'Filme', icon: '🎬' },
        { id: 'cep', label: 'CEP', icon: '📍' },
        { id: 'comida', label: 'Comida', icon: '🍕' },
        { id: 'profissao', label: 'Profissão', icon: '💼' }
      ]
    };

    this.rooms.set(roomId, room);
    return room;
  }

  joinRoom(roomId, player) {
    let room = this.rooms.get(roomId);
    
    if (!room) {
      room = this.createRoom(roomId);
    }

    // Verificar se a sala está cheia
    if (room.players.length >= room.maxPlayers) {
      throw new Error('Sala está cheia');
    }

    // Verificar se já existe um jogador com esse nome
    const existingPlayer = room.players.find(p => p.name === player.name);
    if (existingPlayer) {
      throw new Error('Já existe um jogador com esse nome na sala');
    }

    // Se é o primeiro jogador, ele vira host
    if (room.players.length === 0) {
      room.hostId = player.id;
    }

    room.players.push(player);
    return room;
  }

  removePlayer(roomId, playerId) {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    room.players = room.players.filter(p => p.id !== playerId);
    
    // Se a sala ficar vazia, remove ela
    if (room.players.length === 0) {
      if (room.timer) {
        clearInterval(room.timer);
      }
      this.rooms.delete(roomId);
      return null;
    }

    return room;
  }

  getRoom(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error('Sala não encontrada');
    }
    return room;
  }

  getAllRooms() {
    return Array.from(this.rooms.values());
  }

  getRoomStats() {
    return {
      totalRooms: this.rooms.size,
      totalPlayers: Array.from(this.rooms.values()).reduce((sum, room) => sum + room.players.length, 0)
    };
  }

  updateCategories(roomId, categories) {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error('Sala não encontrada');
    }
    room.categories = categories;
    return room;
  }

  startRound(roomId, letter) {
    const room = this.getRoom(roomId);
    room.currentLetter = letter;
    room.gameState = 'playing';
    room.timeLeft = 60;
    room.roundStartTime = new Date();
    
    // Reset player answers
    room.players.forEach(player => {
      player.answers = {};
      player.finished = false;
    });

    return {
      letter,
      timeLeft: room.timeLeft,
      round: room.currentRound
    };
  }

  endRound(roomId) {
    const room = this.getRoom(roomId);
    room.gameState = 'voting';
    
    if (room.timer) {
      clearInterval(room.timer);
      room.timer = null;
    }

    // Prepare voting data using GameLogic
    const GameLogic = require('./gameLogic');
    const gameLogic = new GameLogic();
    const votingData = gameLogic.prepareVotingData(room.players, room.currentLetter, room.categories);
    room.voting = votingData;

    return {
      votingData,
      players: room.players
    };
  }

  submitAnswers(roomId, playerId, answers) {
    const room = this.getRoom(roomId);
    const player = room.players.find(p => p.id === playerId);
    
    if (!player) {
      throw new Error('Jogador não encontrado');
    }

    player.answers = answers;
    player.finished = true;

    return room;
  }

  voteWord(roomId, targetPlayerId, category, vote, voterId) {
    const room = this.getRoom(roomId);
    
    if (!room.voting) {
      throw new Error('Votação não iniciada');
    }

    if (!room.voting[category] || !room.voting[category][targetPlayerId]) {
      throw new Error('Palavra não encontrada para votação');
    }

    // Inicializa estrutura de votos
    const wordVoting = room.voting[category][targetPlayerId];
    if (!wordVoting.votes) {
      wordVoting.votes = {};
    }

    // Registra voto do votante (último voto prevalece)
    wordVoting.votes[voterId] = vote;

    return room;
  }

  allVotesComplete(roomId) {
    const room = this.getRoom(roomId);
    if (!room.voting) return false;

    const requiredVotes = Math.max(0, room.players.length - 1);
    let allComplete = true;

    for (const categoryId in room.voting) {
      const categoryVoting = room.voting[categoryId];
      for (const authorId in categoryVoting) {
        const wordVoting = categoryVoting[authorId];
        if (!wordVoting.needsVoting) continue;
        const votes = wordVoting.votes || {};
        const voteCount = Object.keys(votes).length;
        if (voteCount < requiredVotes) {
          allComplete = false;
        }
        // Se já atingiu o número de votos necessários, calcula resultado parcial
        if (voteCount >= requiredVotes) {
          const accepts = Object.values(votes).filter(v => v === 'accept').length;
          const rejects = Object.values(votes).filter(v => v === 'reject').length;
          wordVoting.result = accepts > rejects ? 'accepted' : 'rejected';
        }
      }
    }

    return allComplete;
  }

  updateScores(roomId, scores) {
    const room = this.getRoom(roomId);
    
    scores.forEach(scoreData => {
      const player = room.players.find(p => p.id === scoreData.playerId);
      if (player) {
        player.score += scoreData.roundScore;
      }
    });

    return room;
  }

  removePlayer(playerId) {
    for (const [roomId, room] of this.rooms) {
      const playerIndex = room.players.findIndex(p => p.id === playerId);
      if (playerIndex !== -1) {
        room.players.splice(playerIndex, 1);
        
        // Se a sala ficar vazia, remove ela
        if (room.players.length === 0) {
          if (room.timer) {
            clearInterval(room.timer);
          }
          this.rooms.delete(roomId);
        }
        
        return room;
      }
    }
    
    return null;
  }
}

module.exports = RoomManager;