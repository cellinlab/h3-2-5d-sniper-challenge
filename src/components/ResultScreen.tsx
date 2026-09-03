/**
 * Result screen (success / failure / missing-media / practice-success).
 * Success shows elapsed seconds, distance and "一次命中" from
 * specs/DESIGN.md §4; failure shows the COMPROMISED footer and the
 * "目标先一步锁定了你" explanation from §5. Missing-media reuses the
 * §6 copy. Practice success shows "X / 3 CLEARED" + total shots +
 * accuracy so the player can see how the session went.
 */

import type { SceneConfig } from "../types/scene";

type PracticeSummary = {
  cleared: number;
  total: number;
  shots: number;
  hits: number;
};

type Props = {
  variant: "success" | "failure" | "missing-media" | "practice-success";
  scene: SceneConfig;
  elapsedMs: number;
  onRetry: () => void;
  onBack: () => void;
  /**
   * Populated for the practice-success variant. The mission
   * variants derive their data from the scene + state directly.
   */
  practiceSummary: PracticeSummary | null;
};

const formatSeconds = (ms: number): string => {
  const total = Math.round(ms / 100) / 10;
  return total.toFixed(1);
};

const formatAccuracy = (hits: number, shots: number): string => {
  if (shots <= 0) return "—";
  const pct = Math.round((hits / shots) * 1000) / 10;
  return `${pct.toFixed(1)}%`;
};

export const ResultScreen = ({
  variant,
  scene,
  elapsedMs,
  onRetry,
  onBack,
  practiceSummary,
}: Props) => {
  if (variant === "missing-media") {
    return (
      <div className="result-screen" data-testid="result-missing-media">
        <h1>任务素材未就绪</h1>
        <p className="explanation">请按 README 配置本地场景媒体后重试。</p>
        <div className="menu-actions">
          <button className="primary" onClick={onBack} data-testid="missing-media-back">
            返回选场
          </button>
        </div>
      </div>
    );
  }
  if (variant === "practice-success") {
    const summary = practiceSummary ?? { cleared: 0, total: 0, shots: 0, hits: 0 };
    return (
      <div className="result-screen" data-testid="result-practice">
        <h1>全部目标已清除</h1>
        <p className="explanation">练习场 · 不限时多目标</p>
        <div className="result-stats">
          <div className="stat">
            <div className="stat-label">用时</div>
            <div className="stat-value">{formatSeconds(elapsedMs)} 秒</div>
          </div>
          <div className="stat">
            <div className="stat-label">清除</div>
            <div className="stat-value" data-testid="result-cleared">
              {summary.cleared} / {summary.total}
            </div>
          </div>
          <div className="stat">
            <div className="stat-label">射击</div>
            <div className="stat-value" data-testid="result-shots">
              {summary.shots} 发 · 命中 {summary.hits}
            </div>
          </div>
          <div className="stat">
            <div className="stat-label">准确率</div>
            <div className="stat-value" data-testid="result-accuracy">
              {formatAccuracy(summary.hits, summary.shots)}
            </div>
          </div>
        </div>
        <div className="menu-actions">
          <button className="primary" onClick={onRetry} data-testid="practice-retry">
            再来一次
          </button>
          <button className="ghost" onClick={onBack} data-testid="practice-back">
            返回选场
          </button>
        </div>
        <div className="menu-footer">{scene.sectorLabel} // H2.3 PRACTICE</div>
      </div>
    );
  }
  if (variant === "success") {
    const target = scene.targets[0];
    return (
      <div className="result-screen" data-testid="result-success">
        <h1>目标已清除</h1>
        <p className="explanation">任务完成 · 撤离中</p>
        <div className="result-stats">
          <div className="stat">
            <div className="stat-label">用时</div>
            <div className="stat-value">{formatSeconds(elapsedMs)} 秒</div>
          </div>
          <div className="stat">
            <div className="stat-label">距离</div>
            <div className="stat-value">{target ? `${target.distanceMeters} 米` : "—"}</div>
          </div>
          <div className="stat">
            <div className="stat-label">射击</div>
            <div className="stat-value">一次命中</div>
          </div>
        </div>
        <div className="menu-actions">
          <button className="primary" onClick={onRetry} data-testid="success-retry">
            再来一局
          </button>
          <button className="ghost" onClick={onBack} data-testid="success-back">
            返回选场
          </button>
        </div>
        <div className="menu-footer">{scene.sectorLabel} // COMPLETE</div>
      </div>
    );
  }
  return (
    <div className="result-screen" data-testid="result-failure">
      <h1>位置已暴露</h1>
      <p className="explanation">目标先一步锁定了你</p>
      <div className="menu-actions">
        <button className="primary" onClick={onRetry} data-testid="failure-retry">
          重新建立观察
        </button>
        <button className="ghost" onClick={onBack} data-testid="failure-back">
          返回选场
        </button>
      </div>
      <div className="menu-footer">{scene.sectorLabel} // COMPROMISED</div>
    </div>
  );
};
