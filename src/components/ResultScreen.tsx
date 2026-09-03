/**
 * Result screen (success / failure / missing-media). Success shows
 * elapsed seconds, distance and "一次命中" from specs/DESIGN.md §4;
 * failure shows the COMPROMISED footer and the "目标先一步锁定了你"
 * explanation from §5. Missing-media reuses the §6 copy.
 */

import type { SceneConfig } from "../types/scene";

type Props = {
  variant: "success" | "failure" | "missing-media";
  scene: SceneConfig;
  elapsedMs: number;
  onRetry: () => void;
  onBack: () => void;
};

const formatSeconds = (ms: number): string => {
  const total = Math.round(ms / 100) / 10;
  return total.toFixed(1);
};

export const ResultScreen = ({ variant, scene, elapsedMs, onRetry, onBack }: Props) => {
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
