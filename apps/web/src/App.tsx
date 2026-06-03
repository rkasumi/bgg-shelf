import { useEffect, useMemo, useState } from "react";
import { recommendGames } from "./lib/recommend";
import type { BggCollection, BggGame, ShelfFilters } from "./lib/types";

const defaultFilters: ShelfFilters = {
  query: "",
  players: null,
  playerFilterMode: "supported",
  timeRange: null,
  weightRange: null,
  sort: "rank",
  excludeExpansions: true,
};

const dataUrl = `${import.meta.env.BASE_URL}data/collection.json`;
const pageSize = 48;
const pickCount = 3;

function numberOrNull(value: string) {
  if (value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function compactPlayerCounts(values: number[]) {
  const counts = [...new Set(values)].filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  const ranges: string[] = [];

  for (let index = 0; index < counts.length; index += 1) {
    const start = counts[index];
    let end = start;
    while (counts[index + 1] === end + 1) {
      index += 1;
      end = counts[index];
    }
    ranges.push(start === end ? String(start) : `${start} - ${end}`);
  }

  return ranges.join(", ");
}

function formatSupportedPlayers(game: BggGame) {
  if (game.minPlayers === null || game.maxPlayers === null) {
    return "?";
  }
  return game.minPlayers === game.maxPlayers ? String(game.minPlayers) : `${game.minPlayers} - ${game.maxPlayers}`;
}

function PlayerSummary({ game }: { game: BggGame }) {
  const bestPlayers = game.bestPlayerCounts;
  const recommendedPlayers = game.recommendedPlayerCounts.filter((count) => !bestPlayers.includes(count));
  const recommendedLabel = compactPlayerCounts(recommendedPlayers);
  const bestLabel = compactPlayerCounts(bestPlayers);

  return (
    <div className="player-summary" aria-label="人数情報">
      <div className="player-supported">{formatSupportedPlayers(game)}</div>
      {(recommendedLabel || bestLabel) && (
        <div className="player-polls">
          {recommendedLabel ? <span className="player-recommended">{recommendedLabel}</span> : null}
          {bestLabel ? <span className="player-best">{bestLabel}</span> : null}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [collection, setCollection] = useState<BggCollection | null>(null);
  const [loadError, setLoadError] = useState("");
  const [filters, setFilters] = useState<ShelfFilters>(defaultFilters);
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const [picks, setPicks] = useState<BggGame[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadCollection() {
      try {
        const response = await fetch(dataUrl, { cache: "no-cache" });
        if (!response.ok) {
          throw new Error(`${response.status} ${response.statusText}`);
        }
        const contentType = response.headers.get("content-type") ?? "";
        if (!contentType.includes("application/json")) {
          throw new Error("collection.json が JSON として配信されていません");
        }
        const json = (await response.json()) as BggCollection;
        if (!cancelled) {
          setCollection(json);
          setLoadError("");
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "collection.json を読み込めませんでした");
        }
      }
    }

    loadCollection();
    return () => {
      cancelled = true;
    };
  }, []);

  const recommendations = useMemo(() => {
    if (!collection) {
      return [];
    }
    return recommendGames(collection.games, filters);
  }, [collection, filters]);

  useEffect(() => {
    setVisibleCount(pageSize);
  }, [filters]);

  const visibleGames = recommendations.slice(0, visibleCount);

  function pickRandomGames() {
    setPicks(
      [...recommendations]
        .sort(() => Math.random() - 0.5)
        .slice(0, pickCount),
    );
  }

  function scoreClass(score: number | null) {
    if (score === null) {
      return "score-badge score-empty";
    }
    if (score < 5) {
      return "score-badge score-low";
    }
    if (score < 6) {
      return "score-badge score-mid-low";
    }
    if (score < 7) {
      return "score-badge score-mid";
    }
    if (score < 8) {
      return "score-badge score-good";
    }
    return "score-badge score-high";
  }

  return (
    <div className="app-shell">
      <header className="top-bar">
        <div>
          <p className="eyebrow">BoardGameGeek Shelf</p>
          <h1>今日は何を遊ぶ？</h1>
        </div>
        <a href="/" className="launcher-link">
          Launcher
        </a>
      </header>

      <main className="layout">
        <section className="filters" aria-label="絞り込み">
          <label className="field field-wide">
            <span>検索</span>
            <input
              value={filters.query}
              onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
              placeholder="名前・カテゴリ・メカニクス"
            />
          </label>

          <label className="field">
            <span>人数</span>
            <select
              value={filters.players ?? ""}
              onChange={(event) => setFilters((current) => ({ ...current, players: numberOrNull(event.target.value) }))}
            >
              <option value="">指定なし</option>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((count) => (
                <option key={count} value={count}>
                  {count}人
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>人数条件</span>
            <select
              value={filters.playerFilterMode}
              onChange={(event) =>
                setFilters((current) => ({ ...current, playerFilterMode: event.target.value as ShelfFilters["playerFilterMode"] }))
              }
            >
              <option value="supported">対応人数</option>
              <option value="recommended">Recommended以上</option>
              <option value="best">Best</option>
            </select>
          </label>

          <label className="field">
            <span>時間</span>
            <select
              value={filters.timeRange ?? ""}
              onChange={(event) => setFilters((current) => ({ ...current, timeRange: event.target.value || null }))}
            >
              <option value="">指定なし</option>
              <option value="0-30">30分以下</option>
              <option value="31-60">31-60分</option>
              <option value="61-90">61-90分</option>
              <option value="91-120">91-120分</option>
              <option value="121+">121分以上</option>
            </select>
          </label>

          <label className="field">
            <span>重さ</span>
            <select
              value={filters.weightRange ?? ""}
              onChange={(event) => setFilters((current) => ({ ...current, weightRange: event.target.value || null }))}
            >
              <option value="">指定なし</option>
              <option value="1">Light (1)</option>
              <option value="2">Medium Light (2)</option>
              <option value="3">Medium (3)</option>
              <option value="4">Medium Heavy (4)</option>
              <option value="5">Heavy (5)</option>
            </select>
          </label>

          <label className="field">
            <span>ソート</span>
            <select
              value={filters.sort}
              onChange={(event) => setFilters((current) => ({ ...current, sort: event.target.value as ShelfFilters["sort"] }))}
            >
              <option value="rank">BGG rank順</option>
              <option value="name">名前順</option>
              <option value="addedAt">追加/更新日降順</option>
            </select>
          </label>

          <label className="check-field">
            <input
              type="checkbox"
              checked={filters.excludeExpansions}
              onChange={(event) => setFilters((current) => ({ ...current, excludeExpansions: event.target.checked }))}
            />
            <span>拡張を除外</span>
          </label>

          <button type="button" className="pick-button" onClick={pickRandomGames} disabled={recommendations.length === 0}>
            おすすめ！
          </button>
        </section>

        <section className="summary" aria-live="polite">
          {collection ? (
            <>
              <div>
                <strong>{recommendations.length}</strong>
                <span> / {collection.games.length} 件</span>
              </div>
              <p>{collection.sourceUsername} / {formatDate(collection.generatedAt)} 更新</p>
            </>
          ) : loadError ? (
            <>
              <div>
                <strong>未同期</strong>
              </div>
              <p>{dataUrl} を配置してください。詳細: {loadError}</p>
            </>
          ) : (
            <>
              <div>
                <strong>読み込み中</strong>
              </div>
              <p>BGG 所持ゲーム一覧を取得しています。</p>
            </>
          )}
        </section>

        <section className="game-grid" aria-label="推薦結果">
          {visibleGames.map((game) => (
            <article className="game-card" key={game.id}>
              <div className={scoreClass(game.bggScore)} title="BGG Score">
                {game.bggScore?.toFixed(1) ?? "-"}
              </div>
              <div className="thumb-wrap">
                {game.thumbnail ? <img src={game.thumbnail} alt="" loading="lazy" /> : <div className="thumb-placeholder" />}
              </div>
              <div className="game-body">
                <div className="game-heading">
                  <h2>{game.name}</h2>
                  <PlayerSummary game={game} />
                </div>
                <p className="meta">
                  {game.playingTime ?? game.maxPlayTime ?? "?"}分 / 重さ {game.weight?.toFixed(1) ?? "?"} / {game.yearPublished ?? "----"}
                </p>
                <div className="score-line">
                  <span>BGG rank {game.rank ? `#${game.rank}` : "-"}</span>
                  {game.userRating !== null ? <span>★{game.userRating.toFixed(1)}</span> : null}
                </div>
              </div>
            </article>
          ))}
        </section>

        {visibleCount < recommendations.length ? (
          <button
            type="button"
            className="load-more-button"
            onClick={() => setVisibleCount((current) => Math.min(current + pageSize, recommendations.length))}
          >
            もっと表示 ({visibleCount} / {recommendations.length})
          </button>
        ) : null}
      </main>

      {picks.length > 0 ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setPicks([])}>
          <section className="pick-modal" role="dialog" aria-modal="true" aria-label="おすすめゲーム" onClick={(event) => event.stopPropagation()}>
            <div className="pick-modal-head">
              <h2>おすすめ！</h2>
              <button type="button" className="modal-close" onClick={() => setPicks([])} aria-label="閉じる">
                ×
              </button>
            </div>
            <div className="pick-list">
              {picks.map((game) => (
                <article className="pick-card" key={game.id}>
                  {game.thumbnail ? <img src={game.thumbnail} alt="" loading="lazy" /> : <div className="pick-placeholder" />}
                  <div>
                    <h3>{game.name}</h3>
                    <p>
                      {formatSupportedPlayers(game)}人 / {game.playingTime ?? game.maxPlayTime ?? "?"}分 / 重さ {game.weight?.toFixed(1) ?? "?"}
                    </p>
                    <p>BGG rank {game.rank ? `#${game.rank}` : "-"}</p>
                  </div>
                </article>
              ))}
            </div>
            <button type="button" className="pick-again-button" onClick={pickRandomGames}>
              もう一度選ぶ
            </button>
          </section>
        </div>
      ) : null}
    </div>
  );
}
