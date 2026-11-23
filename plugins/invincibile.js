// creato da Zeus
module.exports = {
  commands: ['invincibile'],
  name: 'invincibile',
  category: 'funzioni',
  author: 'ZEUS',
  description: 'Ti dice quale personaggio di Invincibile sei',
  usage: '',
  cooldown: 3000,
  async run(sock, m, args, cmd, ctx) {
    try {
      const characters = [
        {
          name: 'Mark Grayson (Invincibile)',
          desc: 'Sei il giovane eroe che lotta per trovare il proprio posto nel mondo, combattendo le proprie paure.'
        },
        {
          name: 'Atom Eve',
          desc: 'Hai un forte senso della giustizia e il potere di trasformare la realtà con la tua immaginazione.'
        },
        {
          name: 'Robert (Robot)',
          desc: 'Sei leale, intelligente e pronto a proteggere i tuoi amici a tutti i costi.'
        },
        {
          name: 'Nolan Grayson (Omni-Man)',
          desc: 'Hai una forza sovrumana e un conflitto interiore tra dovere e desiderio di libertà.'
        },
        {
          name: 'Debbie Grayson',
          desc: 'Sei determinata, coraggiosa e pronta a lottare per la tua famiglia, anche quando le cose sembrano impossibili.'
        },
        {
          name: 'Rex Splode',
          desc: 'Hai un temperamento esplosivo ma un cuore d\'oro, sempre pronto a difendere i più deboli.'
        },
        {
          name: 'Duane Dobermann',
          desc: 'Sei il tipo che preferisce risolvere i problemi con la forza, ma hai anche una parte vulnerabile.'
        },
        {
          name: 'Angie (Teen Team)',
          desc: 'Sei giovane, impulsivo e sempre pronto a dimostrare di poter fare la differenza.'
        }
      ];
      const random = characters[Math.floor(Math.random() * characters.length)];
      const message = `🦸‍♂️ *${ctx.sender ? ctx.sender.split('@')[0] : 'Amico'}*, il personaggio di Invincibile che più ti rappresenta è:\n\n*${random.name}*\n_${random.desc}_`;
      ctx.reply(message);
    } catch (e) {
      console.error(e);
      ctx.err('⚠️ Si è verificato un errore nel generare il tuo personaggio. Riprova più tardi.');
    }
  },
};