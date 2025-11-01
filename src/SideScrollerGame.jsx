// SideScrollerGame.jsx
// Vite + React で動く、当たり判定つき横スクロールの最小実装（ロングステージ版）

import { useEffect, useRef } from "react";
// 🌟 追記: ステージデータファイルをインポート
import {
  TILE,
  TILE_ID,
  LEVEL,
  initialMovers,
  initialEnemies,
  parseLevel,
  T,
} from "./levelData.jsx"; // 拡張子が.jsであることを確認

export default function SideScrollerGame() {
  const canvasRef = useRef(null);
  const requestRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const playerImg = new Image();
    playerImg.src = "/player.jpg";
    // ====== 基本設定 ======
    const W = (canvas.width = 960);
    const H = (canvas.height = 540);
    // TILE は levelData.js からインポート

    // 物理パラメータ
    const GRAVITY = 0.9; // 重力
    const MOVE_SPEED = 0.7; // 地上移動加速
    const AIR_SPEED = 0.5; // 空中移動加速
    const MAX_RUN = 5.0; // 最大走行速度
    const JUMP_VY = -15.5; // ジャンプ初速度
    const FRICTION = 0.85; // 地上摩擦

    // 入力
    const keys = new Set();
    const onDown = (e) => {
      keys.add(e.key.toLowerCase());
    };
    const onUp = (e) => {
      keys.delete(e.key.toLowerCase());
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);

    // ====== ステージ定義の読み込み ======
    const map = parseLevel(LEVEL);

    // ====== 可動ギミックは座標でシンプル指定 ======
    // 移動床（初期状態をディープコピーして使用）
    const movers = initialMovers.map((m) => ({ ...m }));
    // 敵（初期状態をディープコピーして使用）
    const enemies = initialEnemies.map((e) => ({ ...e }));

    const rows = map.length;
    const cols = map[0].length;
    const WORLD_W = cols * TILE;
    const WORLD_H = rows * TILE;

    // ====== エンティティ ======
    const player = {
      x: 3 * TILE,
      y: 6 * TILE,
      w: 34 * 2,
      h: 44 * 2,
      vx: 0,
      vy: 0,
      onGround: false,
      alive: true,
      win: false,
    };

    // カメラ
    const camera = { x: 0, y: 0 };

    // ====== ユーティリティ ======
    const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

    function rectsOverlap(a, b) {
      return (
        a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
      );
    }

    /**
     * 座標のタイルIDを取得。画面下端外は「空間(0)」と扱うよう修正。
     */
    function tileAt(px, py) {
      // 🌟 修正: Y軸の上方向またはX方向の外側は壁 (1)
      if (px < 0 || px >= WORLD_W || py < 0) return 1;

      // 🌟 修正: 画面の下端を越えたら、タイルは存在しない (0) と扱う。
      if (py >= WORLD_H) return 0;

      const tx = Math.floor(px / TILE);
      const ty = Math.floor(py / TILE);
      return map[ty]?.[tx] ?? 0;
    }

    function collideWithMap(entity) {
      // 4点＋中心のサンプリングで当たり（簡易）
      const samples = [
        { x: entity.x, y: entity.y },
        { x: entity.x + entity.w, y: entity.y },
        { x: entity.x, y: entity.y + entity.h },
        { x: entity.x + entity.w, y: entity.y + entity.h },
        { x: entity.x + entity.w / 2, y: entity.y + entity.h / 2 },
      ];
      let onGround = false;

      // X方向の修正
      if (entity.vx !== 0) {
        const bbox = {
          x: entity.x + entity.vx,
          y: entity.y,
          w: entity.w,
          h: entity.h,
        };
        for (const s of samples) {
          const t = tileAt(s.x + entity.vx, s.y);
          if (t === TILE_ID.Ground || t === TILE_ID.Platform) {
            // 1:地面, 4:床（横は止める）
            // ぶつかったらX位置を詰める
            if (entity.vx > 0) {
              const tx = Math.floor((s.x + entity.vx) / TILE);
              bbox.x = tx * TILE - entity.w - 0.01;
            } else {
              const tx = Math.floor((s.x + entity.vx) / TILE);
              bbox.x = (tx + 1) * TILE + 0.01;
            }
            entity.vx = 0;
            break;
          }
        }
        entity.x = bbox.x;
      }

      // Y方向の修正
      if (entity.vy !== 0) {
        const bbox = {
          x: entity.x,
          y: entity.y + entity.vy,
          w: entity.w,
          h: entity.h,
        };
        for (const s of samples) {
          const t = tileAt(s.x, s.y + entity.vy);
          if (t === TILE_ID.Ground || t === TILE_ID.Platform) {
            if (entity.vy > 0) {
              const ty = Math.floor((s.y + entity.vy) / TILE);
              bbox.y = ty * TILE - entity.h - 0.01;
              onGround = true;
            } else {
              const ty = Math.floor((s.y + entity.vy) / TILE);
              bbox.y = (ty + 1) * TILE + 0.01;
            }
            entity.vy = 0;
            break;
          }
        }
        entity.y = bbox.y;
      }

      return { onGround };
    }

    function reset() {
      player.x = 3 * TILE;
      player.y = 6 * TILE;
      player.vx = 0;
      player.vy = 0;
      player.alive = true;
      player.win = false;
      player.onGround = false;

      // 敵と移動床を初期状態に戻す
      initialEnemies.forEach((initE, i) => {
        enemies[i].x = initE.x;
        enemies[i].y = initE.y; // Y座標も念のためリセット
        enemies[i].vx = initE.vx;
        enemies[i].w = initE.w; // 撃破後のリセット
        enemies[i].h = initE.h;
      });
      initialMovers.forEach((initM, i) => {
        movers[i].x = initM.x;
        movers[i].vx = initM.vx;
      });

      camera.x = 0;
      camera.y = 0;
    }

    // ====== メインループ ======
    const step = () => {
      // 入力
      const left = keys.has("arrowleft") || keys.has("a");
      const right = keys.has("arrowright") || keys.has("d");
      const jump =
        keys.has(" ") || keys.has("arrowup") || keys.has("w") || keys.has("z");
      if (keys.has("r")) reset();

      if (player.alive && !player.win) {
        const accel = player.onGround ? MOVE_SPEED : AIR_SPEED;
        if (left) player.vx = Math.max(player.vx - accel, -MAX_RUN);
        if (right) player.vx = Math.min(player.vx + accel, MAX_RUN);
        if (!left && !right && player.onGround) player.vx *= FRICTION;

        // ジャンプ（地上または移動床上）
        if (jump && player.onGround) {
          player.vy = JUMP_VY;
          player.onGround = false;
        }

        // 重力
        player.vy += GRAVITY;

        // 移動床の更新 & 乗っているかチェック
        for (const m of movers) {
          m.x += m.vx;
          if (m.x < m.left) {
            m.x = m.left;
            m.vx *= -1;
          }
          if (m.x + m.w > m.right) {
            m.x = m.right - m.w;
            m.vx *= -1;
          }

          // 乗っている: 足元が床の上側に触れていて下降していない時
          const onTop =
            player.vy >= 0 &&
            player.x + player.w > m.x &&
            player.x < m.x + m.w &&
            Math.abs(player.y + player.h - m.y) < 4;
          if (onTop) {
            player.y = m.y - player.h - 0.01;
            player.vy = 0;
            player.onGround = true;
            // 床の速度をプレイヤーに伝播
            if (!(left && !right) && !(right && !left)) {
              player.x += m.vx; // 入力がない場合、立っているだけで運ばれる
            }
          }
        }

        // タイル衝突
        const col = collideWithMap(player);
        player.onGround = col.onGround || player.onGround;

        // 敵と衝突（乗れば倒す、横・下は死亡）
        for (const e of enemies) {
          // 左右往復
          if (e.w > 0) {
            // 倒されていない敵のみ動かす
            e.x += e.vx;
            if (e.x < e.left) {
              e.x = e.left;
              e.vx *= -1;
            }
            if (e.x + e.w > e.right) {
              e.x = e.right - e.w;
              e.vx *= -1;
            }

            if (rectsOverlap(player, e)) {
              // プレイヤーの足元と敵の上端の距離をチェック
              const feetAbove = player.vy > 0 && player.y + player.h - e.y < 16;
              if (feetAbove) {
                // 踏んで撃破 → 反発
                e.x = -9999;
                e.w = 0; // 雑に消す
                player.vy = JUMP_VY * 0.6;
              } else {
                player.alive = false;
              }
            }
          }
        }

        // 🌟 トゲ・ゴール判定（プレイヤー中心点で簡易）
        const cx = player.x + player.w / 2;
        const cy = player.y + player.h / 2;
        const t = tileAt(cx, cy);
        const DEATH_Y_PIXEL = T(11);
        if (t === TILE_ID.Spike) player.alive = true; // トゲ (ID: 2) で死亡
        if (t === TILE_ID.Flag) player.win = true;
        if (player.y > DEATH_Y_PIXEL) player.alive = true;
      }

      // カメラ追従
      camera.x = clamp(player.x + player.w / 2 - W / 2, 0, WORLD_W - W);
      camera.y = 0; // Y方向は追従しない

      // ====== 描画 ======
      ctx.clearRect(0, 0, W, H);

      // 背景
      ctx.fillStyle = "#87CEFA";
      ctx.fillRect(0, 0, W, H);

      // タイル描画（ビューポート内だけ）
      const startCol = Math.floor(camera.x / TILE);
      const endCol = Math.ceil((camera.x + W) / TILE);
      for (let y = 0; y < rows; y++) {
        for (let x = startCol; x < endCol; x++) {
          const id = map[y][x];
          if (!id) continue;
          const sx = x * TILE - camera.x;
          const sy = y * TILE - camera.y;
          if (id === TILE_ID.Ground) {
            ctx.fillStyle = "#654321";
            ctx.fillRect(sx, sy, TILE, TILE);
            ctx.fillStyle = "#2e8b57";
            ctx.fillRect(sx, sy, TILE, 10);
          } else if (id === TILE_ID.Spike) {
            ctx.fillStyle = "#cc0000";
            ctx.beginPath();
            ctx.moveTo(sx, sy + TILE);
            ctx.lineTo(sx + TILE / 2, sy + 12);
            ctx.lineTo(sx + TILE, sy + TILE);
            ctx.closePath();
            ctx.fill();
          } else if (id === TILE_ID.Flag) {
            // ゴール旗
            ctx.fillStyle = "#333";
            ctx.fillRect(sx + TILE / 2 - 3, sy, 6, TILE);
            ctx.fillStyle = "#ffd700";
            ctx.beginPath();
            ctx.moveTo(sx + TILE / 2 + 3, sy + 6);
            ctx.lineTo(sx + TILE / 2 + 3, sy + 24);
            ctx.lineTo(sx + TILE / 2 + 28, sy + 15);
            ctx.closePath();
            ctx.fill();
          }
        }
      }

      // 移動床
      for (const m of movers) {
        ctx.fillStyle = "#444";
        ctx.fillRect(m.x - camera.x, m.y - camera.y, m.w, TILE / 3);
      }

      // 敵
      ctx.fillStyle = "#8a2be2";
      for (const e of enemies) {
        if (e.w > 0) {
          // 倒されていない敵のみ描画
          ctx.fillRect(e.x - camera.x, e.y - camera.y, e.w, e.h);
          // 目
          ctx.fillStyle = "#fff";
          ctx.fillRect(e.x - camera.x + 6, e.y - camera.y + 8, 8, 8);
          ctx.fillRect(e.x - camera.x + 22, e.y - camera.y + 8, 8, 8);
          ctx.fillStyle = "#000";
          ctx.fillRect(e.x - camera.x + 9, e.y - camera.y + 11, 3, 3);
          ctx.fillRect(e.x - camera.x + 25, e.y - camera.y + 11, 3, 3);
          ctx.fillStyle = "#8a2be2";
        }
      }

      // プレイヤー
      if (playerImg.complete) {
        ctx.drawImage(
          playerImg,
          player.x - camera.x,
          player.y - camera.y,
          player.w,
          player.h
        );
      } else {
        // 読み込み前は仮の青四角
        ctx.fillStyle = "#1e90ff";
        ctx.fillRect(
          player.x - camera.x,
          player.y - camera.y,
          player.w,
          player.h
        );
      }

      // =========================================================
      // 🌟 デバッグUIの表示
      // =========================================================
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(12, 12, 400, 100);
      ctx.fillStyle = "#fff";
      ctx.font = "16px ui-monospace, SFMono-Regular, Menlo, monospace";

      // プレイヤーの座標、速度、状態
      const debugText1 = `X: ${player.x.toFixed(1)} (Tile: ${Math.floor(
        player.x / TILE
      )}) | Y: ${player.y.toFixed(1)} (Tile: ${Math.floor(player.y / TILE)})`;
      const debugText2 = `VX: ${player.vx.toFixed(2)} | VY: ${player.vy.toFixed(
        2
      )} | Ground: ${player.onGround ? "YES" : "NO"}`;

      // 操作説明
      const instructionText =
        "←/→ or A/D: move | Z/↑/Space/W: jump | R: restart";

      // 描画
      ctx.fillText(instructionText, 24, 40);
      ctx.fillText(debugText1, 24, 62);
      ctx.fillText(debugText2, 24, 84);

      if (!player.alive) {
        drawBanner("GAME OVER - Press R");
      } else if (player.win) {
        drawBanner("YOU WIN! - Press R");
      }
      // =========================================================

      requestRef.current = requestAnimationFrame(step);
    };

    function drawBanner(text) {
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(W / 2 - 220, H / 2 - 40, 440, 80);
      ctx.strokeStyle = "#fff";
      ctx.strokeRect(W / 2 - 220, H / 2 - 40, 440, 80);
      ctx.fillStyle = "#fff";
      ctx.font = "24px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.textAlign = "center";
      ctx.fillText(text, W / 2, H / 2 + 8);
      ctx.textAlign = "start";
    }

    // 初期化 & ループ開始
    reset();
    requestRef.current = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(requestRef.current);
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, []);

  return (
    <div className="w-full h-full flex items-center justify-center bg-neutral-900 p-4">
      <div className="max-w-[980px] w-full">
        <h1 className="text-white text-xl mb-2">
          じょぼん風 (ロングステージ版)
        </h1>
        <canvas
          ref={canvasRef}
          className="bg-black w-full h-auto rounded-2xl shadow-lg border border-white/10"
        />
      </div>
    </div>
  );
}
