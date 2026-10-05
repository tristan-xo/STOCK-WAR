# Stock Wars Event Setup Sheet

## Suggested six-round scenario

| Round | Theme | Example news |
|---|---|---|
| 1 | IT boom | Major global technology spending increases |
| 2 | Banking shock | Unexpected banking-sector credit concerns |
| 3 | Commodity cycle | Energy and metal prices surge |
| 4 | Healthcare breakthrough | New healthcare/pharma demand catalyst |
| 5 | Manufacturing & defence | Large domestic capex/defence order cycle |
| 6 | Digital consumer economy | Telecom and consumer-tech growth surprise |

You can replace all news from the Admin → Rounds & News page.

## Important host rule

Do not reveal the impact percentages to players. The player UI currently shows the current-round impact column for transparency during testing. Before the real event, remove or hide that column from `public/app.js` if you want the impacts to remain secret.

The backend itself keeps the impact values server-side.

## Winning condition

Winner = player with the highest final portfolio value after Round 6 impacts are applied.

Tie-breaker recommendation:
1. Higher final cash
2. Lower number of trades
3. Earlier account registration time

The current app ranks by portfolio value/profit. Add a tie-breaker if your event rules require it.


## Round timing

**Start Round → News published → 2:00 news countdown → trading opens → 3:00 trading countdown → trading closes → prices automatically applied.**

The same countdown is displayed to the host and every player. Pause/Resume is an emergency control that freezes and resumes the server timer.
