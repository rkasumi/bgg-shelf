# bgg-shelf

- collection schema変更はsync出力、Web reader、fixture、sample validationを揃える。
- 実collection JSON、BGG username/tokenをcommitしない。production deploy・sync scheduling・DNS・auth・backupの正本はprivate ops。
- sampleは `pnpm validate:sample`、実データ混入は `pnpm check:secrets`。sync job実行はBGGへの通信と出力更新を伴う。
