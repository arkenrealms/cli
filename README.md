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

Run the individual module CLI:

```
npx tsx src/modules/config/config.cli.ts list
npx tsx src/modules/config/config.cli.ts set metaverse Arken
npx tsx src/modules/application/application.cli.ts create ABC
npx tsx src/modules/math/math.cli.ts add 1 1
npx tsx src/modules/help/help.cli.ts man cerebro
```
