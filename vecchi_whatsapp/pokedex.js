'use strict'
module.exports = {
    commands: ['pokedex', 'pokemon'],
    category: 'fun',
    description: 'Cerca un Pokémon',
    usage: '<nome o numero>',
    async run(sock, m, args, cmd, ctx) {
        if (!args.length) return ctx.err('Scrivi il nome o il numero di un Pokémon!\nEsempio: *.pokedex pikachu*')
        const query = args[0].toLowerCase()
        
        await ctx.react('🔎')
        try {
            const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${query}`)
            if (!res.ok) return ctx.err(`Pokémon *${query}* non trovato.`)
            
            const data = await res.json()
            const name = data.name.charAt(0).toUpperCase() + data.name.slice(1)
            const types = data.types.map(t => t.type.name).join(', ')
            const img = data.sprites.other['official-artwork'].front_default || data.sprites.front_default
            
            const text = ctx.ui.box(`🔴 POKÉDEX - ${name.toUpperCase()}`, [
                `🆔 Numero: *#${data.id}*`,
                `⚔️ Tipo: *${types}*`,
                `📏 Altezza: *${data.height / 10} m*`,
                `⚖️ Peso: *${data.weight / 10} kg*`,
                { section: '📊 Statistiche Base' },
                `❤️ HP: *${data.stats[0].base_stat}*`,
                `⚔️ Attacco: *${data.stats[1].base_stat}*`,
                `🛡️ Difesa: *${data.stats[2].base_stat}*`,
                `⚡ Velocità: *${data.stats[5].base_stat}*`
            ])
            
            await sock.sendMessage(ctx.chat, { image: { url: img }, caption: text }, { quoted: m })
            await ctx.react('✅')
        } catch (e) {
            ctx.err('Errore durante il recupero dei dati.')
        }
    }
}
