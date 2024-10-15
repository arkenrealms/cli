# Setup

Run `rush update`

## Using Commands

Try out:

```bash
./bin/arken config.list
./bin/arken config.set metaverse Arken
./bin/arken application.create ABC
./bin/arken math.add 1 1
./bin/arken help.man cerebro
```

TODO:

```bash
./bin/arken ask "Some question here"
./bin/arken agent.create AgentName
./bin/arken agent.call AgentName MethodName Param1 Param2 Param3
./bin/arken agent.call hisoka run
./bin/arken agent.call hisoka fetchAndProcessVideos H3AZiZUzglE
./bin/arken game.getEras
./bin/arken game.getEra 66d242abcfa9286652ddea64
./bin/arken game.getEra `{ where: { name: { equals: "Prehistory" } } }`
./bin/arken evolution.info
./bin/arken evolution.auth
./bin/arken evolution.connectSeer
./bin/arken evolution.createShard
./bin/arken evolution.getShards `{ where: { realmId: { equals: "REALM ID HERE" } } }`
```

Run the individual module CLI:

```
npx tsx src/modules/config/config.cli.ts list
npx tsx src/modules/config/config.cli.ts set metaverse Arken
npx tsx src/modules/application/application.cli.ts create ABC
npx tsx src/modules/math/math.cli.ts add 1 1
npx tsx src/modules/help/help.cli.ts man cerebro
```
