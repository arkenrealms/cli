# Setup

Run `rush update`

## Local test-gate note (rotation automation)
Use Node 20 and Rush scripts in this workspace:
- `source ~/.nvm/nvm.sh && nvm use 20`
- `rushx test`

## Using Commands

Try out:

```bash
source ~/.nvm/nvm.sh
nvm use 20

rushx dev

# OR

rushx cli config.list

# OR

./bin/arken config.list
```

### Cerebro link over tRPC websocket

With `@arken/cerebro-link` running on `ws://127.0.0.1:8080`:

```bash
CEREBRO_SERVICE_URI=ws://127.0.0.1:8080 rushx cli cerebro.info
CEREBRO_SERVICE_URI=ws://127.0.0.1:8080 ./bin/arken cerebro.info
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

For list-style flags, spaced, equals, and repeated short-alias forms are accepted:

```bash
rushx cli some.command --values a b c
rushx cli some.command --values=a --values=b --values=c
rushx cli some.command -v a -v b -v c
```

Run the individual module CLI:

```
npx tsx modules/config/config.cli.ts list
npx tsx modules/config/config.cli.ts set metaverse Arken
npx tsx modules/application/application.cli.ts create ABC
npx tsx modules/math/math.cli.ts add 1 1
npx tsx modules/help/help.cli.ts man cerebro
```
