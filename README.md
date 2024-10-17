# Setup

Run `rush update`

## Using Commands

Try out:

```bash
rushx cli config.list
rushx cli config.set metaverse Arken
rushx cli application.create ABC
rushx cli math.add 1 1
rushx cli help.man cerebro
rushx cli seer.info # calls Seer service

./bin/arken config.list
./bin/arken config.set metaverse Arken
./bin/arken application.create ABC
./bin/arken math.add 1 1
./bin/arken help.man cerebro
```

TODO:

```bash
./bin/arken ask "Some question here"
./bin/arken omniverse.set `{ where: { key: { equals: "arken" } } }`
./bin/arken metaverse.set `{ where: { key: { equals: "arken" } } }`
./bin/arken application.set `{ where: { name: { equals: "Arken" } } }`
./bin/arken product.set `{ where: { key: { equals: "arken-isles" } } }`
./bin/arken game.set `{ where: { key: { equals: "arken-isles" } } }`
./bin/arken game.getEras
./bin/arken game.getEra `{ where: { name: { equals: "Prehistory" } } }`
./bin/arken agent.create AgentName
./bin/arken agent.call AgentName MethodName Param1 Param2 Param3
./bin/arken agent.call hisoka run
./bin/arken agent.call hisoka fetchAndProcessVideos H3AZiZUzglE
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
