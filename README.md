# Setup

Run `rush update`

## Local test-gate note (rotation automation)
In this checkout, test execution is currently blocked until dependencies/workspace links are restored:
- `rushx test` may fail if Rush cannot resolve all workspace packages.
- `npm test` requires local `vitest` to be installed and available.

## Using Commands

Try out:

```bash
rushx dev

# OR

rushx cli config.list

# OR

./bin/arken config.list
```

## Usage

### Commands

| Command              | Alias       | Description                                                 |
| -------------------- | ----------- | ----------------------------------------------------------- |
| `config.list`        | `cls`       | Get the list of config variables.                           |
| `config.set`         | `cset`      | Sets the current metaverse/omniverse.                       |
| `application.create` | `appcreate` | Creates an application for the current metaverse/omniverse. |

```bash
config.list
config.set metaverse Arken
application.create ABC
math.add 1 1
help.man cerebro
ask "Some question here"
omniverse.set `{ where: { key: { equals: "arken" } } }`
metaverse.set `{ where: { key: { equals: "arken" } } }`
application.set `{ where: { name: { equals: "Arken" } } }`
product.set `{ where: { key: { equals: "arken-isles" } } }`
game.set `{ where: { key: { equals: "arken-isles" } } }`
game.getEras
game.getEra `{ where: { name: { equals: "Prehistory" } } }`
evolution.info
evolution.auth
evolution.connectSeer
evolution.createShard
evolution.getShards `{ where: { realmId: { equals: "REALM ID HERE" } } }`
oasis.info
oasis.auth --token TOKEN_HERE
oasis.connectSeer
oasis.createShard
oasis.getShards `{ where: { realmId: { equals: "REALM ID HERE" } } }`
cerebro.createAgent AgentName
cerebro.exec --agent AgentName --method MethodName --params Param1 --params Param2 --params Param3
cerebro.exec --agent AgentName --method MethodName --params Param1 Param2 Param3
cerebro.exec --agent Hisoka --method run
cerebro.exec --agent Hisoka --method fetchAndProcessVideos --params H3AZiZUzglE
cerebro.exec Hisoka.run()
cerebro.exec Hisoka.fetchAndProcessVideos("H3AZiZUzglE")
cerebro.exec --agent Gon --method ask --params "calculate 1+1" "you always reply with a smile"
cerebro.exec Gon.ask("calculate 1+1", "you always reply with a smile")
Gon.ask("calculate 1+1", "you always reply with a smile")
```

Run the individual module CLI:

```
npx tsx src/modules/config/config.cli.ts list
npx tsx src/modules/config/config.cli.ts set metaverse Arken
npx tsx src/modules/application/application.cli.ts create ABC
npx tsx src/modules/math/math.cli.ts add 1 1
npx tsx src/modules/help/help.cli.ts man cerebro
```
