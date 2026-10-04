<script setup lang="ts">
import RanchScene from "./RanchScene.vue";
import AnimalPortrait from "./AnimalPortrait.vue";
import { computed, onMounted, onUnmounted, ref, watch, nextTick } from "vue";
import {
  api,
  state,
  now,
  notify,
  activeGame,
  closePersistent,
} from "../../platform/lobby";
import type {
  RanchProfile,
  RanchNeighbor,
  RanchSpecies,
} from "../../../../../packages/contracts/src/ranch";
const profile = ref<RanchProfile | null>(null),
  neighbors = ref<RanchNeighbor[]>([]),
  visiting = ref<string | null>(null);
const panel = ref<
    "animals" | "store" | "neighbors" | "feed" | "detail" | "journal" | null
  >(null),
  busy = ref(false),
  loading = ref(false),
  error = ref(""),
  help = ref(false),
  chosen = ref<string | null>(null),
  pop = ref("");
const shopCategory = ref("all"),
  search = ref(""),
  unlockedOnly = ref(false);
const filteredSpecies = computed(
  () =>
    farm.value?.species.filter(
      (k) =>
        (shopCategory.value === "all" || k.category === shopCategory.value) &&
        (!unlockedOnly.value || (farm.value?.level ?? 0) >= k.unlockLevel) &&
        (!search.value || k.name.includes(search.value)),
    ) || [],
);
const owner = computed(() => !visiting.value),
  farm = computed(() => profile.value?.state);
const selected = computed(() =>
  farm.value?.animals.find((a) => a.id === chosen.value),
);
const harvestCount = computed(
  () => farm.value?.animals.reduce((sum, a) => sum + a.stored, 0) || 0,
);
const stockValue = computed(
  () =>
    farm.value?.inventory?.reduce((sum, p) => sum + p.count * p.price, 0) || 0,
);
const slots = computed(() =>
  Array.from(
    { length: farm.value?.capacity || 4 },
    (_, i) => farm.value?.animals[i] || null,
  ),
);
let timer: ReturnType<typeof setInterval> | undefined,
  seq = 0,
  refreshAgain = false;
async function load() {
  if (loading.value) {
    refreshAgain = true;
    return;
  }
  if (busy.value) return;
  loading.value = true;
  error.value = "";
  const request = ++seq;
  const target = visiting.value,
    me = state.value?.me.id;
  try {
    const result = await api<RanchProfile>(
      "games/animal-ranch/" +
        (target ? "players/" + encodeURIComponent(target) : "me"),
    );
    if (
      request === seq &&
      target === visiting.value &&
      me === state.value?.me.id
    )
      profile.value = result;
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    loading.value = false;
    if (refreshAgain) {
      refreshAgain = false;
      void load();
    }
  }
}
async function list() {
  try {
    neighbors.value = (
      await api<{ players: RanchNeighbor[] }>("games/animal-ranch/players")
    ).players;
  } catch (e) {
    notify((e as Error).message);
  }
}
async function visit(id: string | null) {
  if (busy.value) return;
  visiting.value = id;
  chosen.value = null;
  profile.value = null;
  ++seq;
  await load();
  if (refreshAgain) void load();
}
async function action(type: string, payload: Record<string, unknown> = {}) {
  if (!owner.value || !profile.value || busy.value || loading.value) return;
  busy.value = true;
  error.value = "";
  try {
    const result = await api<RanchProfile>("games/animal-ranch/actions", {
      type,
      payload,
      requestId: crypto.randomUUID(),
      expectedRevision: profile.value.revision,
    });
    if (result.revision >= profile.value.revision) profile.value = result;
    sceneEffect.value = { type, id: ++effectSequence };
    pop.value =
      type === "harvest"
        ? "收获成功！"
        : type === "sellProducts"
          ? "金币到账！"
          : type === "upgrade"
            ? "新位置准备好了！"
            : type === "buyFeed"
              ? "食槽添满了一些！"
              : "牧场更新啦";
    notify(pop.value);
  } catch (e) {
    error.value = (e as Error).message;
    if ((e as { status?: number }).status === 409)
      notify("另一台设备更新了存档，已为你刷新");
  } finally {
    busy.value = false;
    await load();
  }
}
function buy(id: RanchSpecies) {
  void action("buyAnimal", { species: id });
}
function duration(ms: number) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return seconds >= 60
    ? Math.floor(seconds / 60) +
        "分" +
        (seconds % 60 ? (seconds % 60) + "秒" : "")
    : seconds + "秒";
}
function countdown(at: number | null) {
  return at ? duration(at - now.value) : "补充饲料后继续";
}
function animalStatus(a: NonNullable<typeof selected.value>) {
  if (a.stored > 0) return "可收获 " + a.stored + " 份";
  if (a.hungry) return "肚子饿了";
  if (a.nextAt && a.nextAt <= now.value) return "正在确认产出…";
  return a.baby ? "幼崽成长中" : "悠闲产出中";
}
const vectorAnimals = new Set([
  "cat",
  "sheep",
  "goose",
  "fox",
  "deer",
  "alpaca",
  "peacock",
  "hedgehog",
  "turtle",
  "lion",
]);
function image(kind: string, baby = false) {
  const name = kind === "chicken" && baby ? "chick" : kind;
  return "/ranch/" + name + (vectorAnimals.has(name) ? ".svg" : ".png");
}
async function sellAnimal() {
  const a = selected.value;
  if (!a) return;
  if (
    confirm(
      "确定送别这只" + a.name + "吗？幼崽返还购入价的 30%，成年动物返还 60%。",
    )
  ) {
    await action("sellAnimal", { animalId: a.id });
    chosen.value = null;
  }
}
function changed(e: Event) {
  if ((e as CustomEvent).detail?.gameId === "animal-ranch") void load();
}
function visible() {
  if (document.visibilityState === "visible") void load();
}
watch(panel, (p) => {
  if (p === "neighbors") void list();
});
onMounted(async () => {
  await api("presence", { gameId: "animal-ranch" }).catch(() => {});
  await load();
  await list();
  timer = setInterval(() => {
    if (document.visibilityState === "visible") {
      void load();
      void api("presence", { gameId: "animal-ranch" }).catch(() => {});
    }
  }, 15000);
  window.addEventListener("playroom-persistent-change", changed);
  document.addEventListener("visibilitychange", visible);
});
onUnmounted(() => {
  ++seq;
  clearInterval(timer);
  window.removeEventListener("playroom-persistent-change", changed);
  document.removeEventListener("visibilitychange", visible);
  if (!activeGame.value) void api("presence", { gameId: null }).catch(() => {});
});

const panelDialog = ref<HTMLDialogElement | null>(null);
const sceneEffect = ref<{ type: string; id: number } | null>(null);
let effectSequence = 0;
const panelTitle = computed(
  () =>
    ({
      animals: "动物商店",
      store: "我的仓库",
      neighbors: "串门看看",
      feed: "食槽 · 自动喂养",
      detail: selected.value?.name || "动物伙伴",
      journal: "扩建与牧场日记",
    })[panel.value || "animals"],
);
function selectAnimal(id: string) {
  chosen.value = id;
  panel.value = "detail";
}
watch(panel, async (value) => {
  if (value !== "detail") chosen.value = null;
  await nextTick();
  if (value && !panelDialog.value?.open) panelDialog.value?.showModal();
});
</script>
<template>
  <main class="shell ranch-page scene-page">
    <div class="ranch-heading scene-heading">
      <div>
        <button class="quiet small" @click="closePersistent">← 游戏大厅</button>
        <h1>
          {{
            visiting ? (profile?.ownerName || "玩家") + "的牧场" : "一起牧场"
          }}
        </h1>
        <p>一群小伙伴，一块属于你的快乐草地。</p>
      </div>
      <div class="ranch-heading-actions">
        <button class="quiet small" @click="help = true">怎么玩</button
        ><button v-if="visiting" class="ranch-primary" @click="visit(null)">
          回我的牧场
        </button>
      </div>
    </div>
    <p v-if="error" class="error" role="alert">
      {{ error }}
      <button class="quiet small" :disabled="busy || loading" @click="load">
        重试
      </button>
    </p>
    <div v-if="!farm" class="card ranch-loading" role="status">
      {{ loading ? "正在打开牧场…" : "牧场暂时未加载" }}
    </div>
    <template v-else>
      <div class="ranch-hud">
        <div class="hud-level">
          <span>Lv. {{ farm.level }} 牧场主</span
          ><progress
            v-if="owner"
            :value="farm.xp"
            :max="farm.nextLevelXp"
            aria-label="牧场经验"
          ></progress>
        </div>
        <span v-if="owner" class="hud-coin">● {{ farm.coins }} 金币</span
        ><button
          v-if="owner"
          :class="{ hungry: farm.hungry }"
          @click="panel = 'feed'"
        >
          食槽 {{ farm.feed }} 份</button
        ><span>{{ farm.animals.length }} / {{ farm.capacity }} 伙伴</span>
      </div>
      <RanchScene
        :animals="farm.animals"
        :chosen="chosen"
        :owner="owner"
        :effect="sceneEffect"
        @select="selectAnimal"
        @feed="panel = 'feed'"
        @shop="panel = 'animals'"
      />
      <nav class="ranch-toolbelt" aria-label="牧场工具栏">
        <button
          v-if="owner"
          :disabled="busy || loading || !harvestCount"
          @click="action('harvest')"
        >
          <span>🧺</span>一键收获 <small>{{ harvestCount }} 份</small>
        </button>
        <button @click="panel = 'animals'">
          <span>🐣</span>动物商店<small>36 种伙伴</small>
        </button>
        <button v-if="owner" @click="panel = 'feed'">
          <span>🌾</span>添饲料<small>{{
            farm.hungry ? "伙伴饿了" : "自动喂养"
          }}</small>
        </button>
        <button v-if="owner" @click="panel = 'store'">
          <span>📦</span>我的仓库<small>{{ stockValue }} 金币估值</small>
        </button>
        <button @click="panel = 'neighbors'">
          <span>🏡</span>去串门<small>看看其他牧场</small>
        </button>
        <button v-if="owner" @click="panel = 'journal'">
          <span>🔨</span>扩建 / 日记<small>{{ farm.capacity }} 个位置</small>
        </button>
      </nav>
      <p class="ranch-footnote">
        {{
          owner
            ? "饲料充足，关掉网页也会继续成长。"
            : "参观模式 · 可以看动物，不能操作他人的资源。"
        }}
      </p>
    </template>
  </main>
  <Teleport to="body">
    <dialog
      v-if="panel && farm"
      ref="panelDialog"
      class="card ranch-window"
      aria-labelledby="ranch-window-title"
      @cancel.prevent="panel = null"
      @click="
        (e) => {
          if (e.target === panelDialog) panel = null;
        }
      "
    >
      <div class="ranch-window-heading">
        <h2 id="ranch-window-title">{{ panelTitle }}</h2>
        <button
          class="quiet small"
          aria-label="关闭牧场面板"
          @click="panel = null"
        >
          关闭 ✕
        </button>
      </div>
      <p v-if="error" role="alert" class="error">{{ error }}</p>
      <section v-if="panel === 'feed' && owner" class="card ranch-feed">
        <div class="section-label">
          <h2>食槽</h2>
          <span class="tag" :class="{ danger: farm.hungry }">{{
            farm.hungry ? "需要喂食" : "自动喂养"
          }}</span>
        </div>
        <div class="ranch-feed-amount">
          <span aria-hidden="true">✿</span><strong>{{ farm.feed }}</strong
          ><span>份饲料</span>
        </div>
        <progress
          :value="farm.feed"
          max="1000"
          aria-label="食槽剩余饲料"
        ></progress>
        <p>
          {{
            farm.animals.length
              ? "当前伙伴可再吃约 " + farm.feedMinutes + " 分钟"
              : "先认养一只小动物吧"
          }}。每只动物每分钟吃 1 份。
        </p>
        <div class="ranch-feed-buttons">
          <button
            v-for="units in [20, 100, 300]"
            :key="units"
            :disabled="
              busy ||
              loading ||
              (farm.coins || 0) < units ||
              (farm.feed || 0) + units > 1000
            "
            @click="action('buyFeed', { units })"
          >
            +{{ units }}<small>{{ units }} 金币</small>
          </button>
        </div>
        <small>缺粮暂停成长，动物不会死亡。</small>
      </section>
      <section v-if="panel === 'detail'" class="card ranch-animal-detail">
        <template v-if="selected"
          ><div class="row spread">
            <h2>{{ selected.name }}</h2>
            <span class="tag">{{ selected.baby ? "幼崽" : "成年" }}</span>
          </div>
          <div class="ranch-detail-portrait">
            <AnimalPortrait :species="selected.species" :name="selected.name" />
          </div>
          <strong>{{ animalStatus(selected) }}</strong>
          <p v-if="!selected.hungry && selected.stored < selected.capacity">
            {{ selected.baby ? "距离成年" : "下次产出" }}：{{
              countdown(selected.nextAt)
            }}
          </p>
          <progress
            :value="selected.progress"
            max="1"
            :aria-label="selected.baby ? '成长进度' : '产出进度'"
          ></progress>
          <p>
            {{ selected.productName }} {{ selected.stored }} /
            {{ selected.capacity }}，最多保留 3 轮。
          </p>
          <div v-if="owner" class="actions">
            <button
              class="ranch-primary"
              :disabled="busy || loading || !selected.stored"
              @click="action('harvest', { animalId: selected.id })"
            >
              收获这只</button
            ><button
              class="quiet small"
              :disabled="busy || loading || !!selected.stored"
              @click="sellAnimal"
            >
              出售动物
            </button>
          </div>
        </template>
        <template v-else
          ><span class="eyebrow">LITTLE COMPANIONS</span>
          <h2>点一下你的伙伴</h2>
          <p>查看成长进度、下次产出和已经准备好的礼物。</p>
        </template>
      </section>
      <div v-if="panel === 'animals'" class="ranch-shop-filters">
        <div>
          <button
            v-for="c in [
              { id: 'all', name: '全部 36 种' },
              { id: 'farm', name: '家禽家畜' },
              { id: 'pets', name: '可爱萌宠' },
              { id: 'zoo', name: '动物园' },
            ]"
            :key="c.id"
            class="quiet small"
            :class="{ active: shopCategory === c.id }"
            @click="shopCategory = c.id"
          >
            {{ c.name }}
          </button>
        </div>
        <input
          v-model="search"
          type="search"
          aria-label="搜索动物"
          placeholder="搜索动物名字"
        /><label
          ><input v-model="unlockedOnly" type="checkbox" />仅看已解锁</label
        ><span class="muted">{{ filteredSpecies.length }} 种伙伴</span>
      </div>
      <div v-if="panel === 'animals'" class="ranch-shop-grid">
        <article
          v-for="kind in filteredSpecies"
          :key="kind.id"
          class="ranch-shop-animal"
          :class="{ locked: farm.level < kind.unlockLevel }"
        >
          <span class="ranch-shop-lock">{{
            farm.level < kind.unlockLevel
              ? "Lv. " + kind.unlockLevel + " 解锁"
              : "Lv. " + kind.unlockLevel + " 起可养"
          }}</span>
          <div class="shop-fullbody">
            <AnimalPortrait :species="kind.id" :name="kind.name" />
          </div>
          <h3>{{ kind.name }}</h3>
          <p class="ranch-animal-description">{{ kind.description }}</p>
          <p>{{ kind.productName }} · 每轮 {{ kind.yield }} 份</p>
          <div class="ranch-shop-meta">
            <span>成长 {{ duration(kind.growthMs) }}</span
            ><span>产出 {{ duration(kind.cycleMs) }}</span>
          </div>
          <button
            v-if="owner"
            class="ranch-primary"
            :disabled="
              busy ||
              loading ||
              farm.level < kind.unlockLevel ||
              (farm.coins || 0) < kind.price ||
              farm.animals.length >= farm.capacity
            "
            @click="buy(kind.id)"
          >
            {{
              farm.level < kind.unlockLevel
                ? "尚未解锁"
                : kind.price + " 金币 · 认养"
            }}
          </button>
        </article>
      </div>
      <div v-else-if="panel === 'store' && owner" class="ranch-inventory">
        <div
          v-for="product in farm.inventory?.filter((p) => p.count > 0)"
          :key="product.id"
          class="ranch-product"
        >
          <span>{{ product.name }}</span
          ><strong>{{ product.count }} <small>份</small></strong>
          <p>{{ product.price }} 金币 / 份</p>
          <button
            class="quiet small"
            :disabled="busy || loading || !product.count"
            @click="action('sellProducts', { product: product.id })"
          >
            出售
          </button>
        </div>
        <p v-if="!stockValue" class="empty" style="grid-column: 1/-1">
          仓库还是空的，先去收获动物的产物吧。
        </p>
        <div class="ranch-sell-all">
          <p>
            仓库估值 <strong>{{ stockValue }} 金币</strong>
          </p>
          <button
            class="ranch-primary"
            :disabled="busy || loading || !stockValue"
            @click="action('sellProducts')"
          >
            出售全部产物
          </button>
        </div>
      </div>
      <div v-else-if="panel === 'neighbors'" class="ranch-neighbors">
        <p class="muted">已经开过牧场的玩家都在这里，离线也可以参观。</p>
        <div v-for="player in neighbors" :key="player.id" class="player-line">
          <div class="avatar">{{ player.name.slice(0, 1) }}</div>
          <div class="details">
            <strong>{{ player.name }}</strong
            ><small>Lv. {{ player.level }} · {{ player.animals }} 只动物</small>
          </div>
          <button
            class="quiet small"
            :disabled="busy || loading"
            @click="visit(player.id)"
          >
            参观牧场
          </button>
        </div>
        <p v-if="!neighbors.length" class="empty">
          还没有其他牧场主，叫朋友来认养第一只小动物吧。
        </p>
        <button class="quiet small" @click="list">刷新玩家</button>
      </div>
      <div v-if="panel === 'journal' && owner" class="ranch-bottom">
        <section class="card ranch-expand">
          <span class="eyebrow">MAKE ROOM FOR MORE</span>
          <h2>给新伙伴一个位置</h2>
          <p>
            当前 {{ farm.capacity }} 个位置。扩建每次增加 2 个，最多 16 个。
          </p>
          <button
            class="quiet"
            :disabled="
              busy ||
              loading ||
              !farm.upgradeCost ||
              (farm.coins || 0) < (farm.upgradeCost || 0)
            "
            @click="action('upgrade')"
          >
            {{
              farm.upgradeCost
                ? "扩建牧场 · " + farm.upgradeCost + " 金币"
                : "已完成全部扩建"
            }}
          </button>
        </section>
        <section class="card">
          <h2>牧场日记</h2>
          <div
            v-for="entry in farm.log?.slice(0, 5)"
            :key="entry.id"
            class="ranch-log"
          >
            <span>{{ entry.message }}</span
            ><small>{{
              new Date(entry.at).toLocaleTimeString("zh-CN", {
                hour: "2-digit",
                minute: "2-digit",
              })
            }}</small>
          </div>
          <p v-if="!farm.log?.length" class="muted">
            第一只小鸡正在等你。收获一次，故事就开始了。
          </p>
        </section>
      </div>
    </dialog>
    <div v-if="help" class="modal-backdrop" @click.self="help = false">
      <section
        class="card modal-card"
        role="dialog"
        aria-modal="true"
        aria-label="牧场玩法说明"
      >
        <h2>欢迎来到一起牧场</h2>
        <p>点小动物查看成长和收获；点食槽添饲料，点畜舍打开商店。</p>
        <p>
          收获 → 在仓库出售 → 认养幼崽 → 喂养成长。每只每分钟吃 1
          份，缺粮暂停、不死亡，最多存 3 轮产物。
        </p>
        <p>
          36
          种伙伴分等级解锁，所有设备共用同一份存档。手机可以拖动场景、双指缩放；“全景”回到整个牧场。
        </p>
        <button class="ranch-primary" @click="help = false">知道啦</button>
      </section>
    </div>
  </Teleport>
</template>
<style scoped>
.ranch-page {
  --ranch-green: #285b3b;
  --ranch-button: #c9e58b;
  --ranch-light: #edf3e3;
  --ranch-ink: #30462f;
  padding-top: 30px;
}
.ranch-heading {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: end;
  margin-bottom: 25px;
}
.ranch-heading h1 {
  font-size: clamp(1.9rem, 4vw, 2.8rem);
  margin: 6px 0 2px;
  letter-spacing: -0.05em;
}
.ranch-heading p {
  color: var(--muted);
  margin: 0;
}
.ranch-back {
  display: block;
  margin-bottom: 18px;
}
.ranch-heading .eyebrow {
  color: var(--muted);
  font-size: 0.65rem;
}
.ranch-heading-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.ranch-level {
  color: var(--ranch-green);
  background: var(--ranch-button);
  padding: 8px 14px;
  border-radius: 100px;
  font-size: 0.85rem;
  font-weight: 700;
}
.ranch-summary {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
  margin-bottom: 22px;
}
.ranch-summary > div {
  border: 1px solid var(--line);
  border-radius: 18px;
  padding: 17px 21px;
  background: var(--surface);
}
.ranch-summary span,
.ranch-summary small {
  display: block;
  color: var(--muted);
  font-size: 0.75rem;
}
.ranch-summary strong {
  font-size: 1.65rem;
  display: block;
  margin: 4px 0;
}
.ranch-summary em {
  font-style: normal;
  font-size: 0.85rem;
  font-weight: 400;
  color: var(--muted);
}
.ranch-summary i {
  font-style: normal;
  color: #ddb963;
  font-size: 1rem;
}
.ranch-main {
  display: grid;
  grid-template-columns: minmax(0, 1.9fr) minmax(280px, 1fr);
  gap: 22px;
  margin-bottom: 24px;
}
.ranch-pasture-card {
  border-radius: 22px;
  overflow: hidden;
  background: var(--surface);
  border: 1px solid var(--line);
  align-self: start;
}
.ranch-scene-title,
.ranch-scene-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 17px 20px;
}
.ranch-scene-title {
  font-weight: 600;
  font-size: 0.85rem;
}
.ranch-scene-title > span {
  font-size: 0.75rem;
  color: var(--muted);
  font-weight: 400;
}
.ranch-live-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #77a354;
  margin-right: 7px;
}
.ranch-scene {
  background: #b4d395 url("/ranch/pasture.svg") center/cover;
  min-height: 380px;
  position: relative;
}
.ranch-field-grid {
  position: absolute;
  inset: 33% 5% 6%;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  align-content: space-around;
  gap: 12px 4px;
}
.ranch-large {
  min-height: 510px;
}
.ranch-field-animal {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: none;
  border: 0;
  padding: 4px;
  min-height: 92px;
  color: #244331;
  border-radius: 18px;
}
.ranch-field-animal:hover:not(:disabled) {
  background: #fff4;
}
.ranch-field-animal.selected {
  background: #fff5;
  outline: 2px solid #eef7d2;
}
.ranch-field-animal img {
  width: 65px;
  height: 65px;
  object-fit: contain;
  z-index: 1;
  animation: animal-idle 3.5s ease-in-out infinite;
  animation-delay: var(--delay);
}
.ranch-field-animal.young img {
  width: 50px;
  height: 50px;
}
.animal-shadow {
  position: absolute;
  width: 55px;
  height: 12px;
  top: 66px;
  background: #35532925;
  border-radius: 50%;
}
.animal-caption {
  display: block;
  font-weight: 600;
  font-size: 0.72rem;
  padding: 1px 8px;
  border-radius: 9px;
  background: #f8ffe0ce;
  z-index: 2;
}
.animal-caption small {
  margin-left: 4px;
  font-weight: 400;
  font-size: 0.6rem;
}
.ranch-produce {
  background: #fff9df;
  color: #685726;
  box-shadow: 0 2px 7px #3453311a;
  border-radius: 20px;
  padding: 2px 9px;
  font-size: 0.65rem;
  font-weight: 700;
  position: absolute;
  top: -12px;
  z-index: 3;
  white-space: nowrap;
}
.ranch-produce.hungry {
  background: #ffe0bc;
  color: #795631;
}
.empty-circle {
  border: 1px dashed #fff9;
  border-radius: 50%;
  width: 46px;
  height: 46px;
  display: grid;
  place-items: center;
  color: #fff;
  font-size: 1.2rem;
  background: #6e944222;
  margin-bottom: 6px;
}
.empty-plot .animal-caption {
  opacity: 0.7;
  background: none;
}
.ranch-scene-footer p {
  font-size: 0.75rem;
  color: var(--muted);
  max-width: 230px;
  margin: 0;
}
.ranch-primary {
  background: var(--ranch-button);
  color: var(--ranch-ink);
  border-color: transparent;
}
.ranch-primary:hover:not(:disabled) {
  background: #d8edac;
}
.ranch-primary span {
  padding: 2px 6px;
  background: #ffffff40;
  border-radius: 6px;
  margin-left: 6px;
}
.ranch-side {
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.ranch-side .card {
  padding: 20px;
}
.ranch-side h2,
.ranch-bottom h2,
.ranch-workshop h3 {
  font-size: 1.05rem;
  margin: 0;
}
.ranch-feed p,
.ranch-animal-detail p {
  font-size: 0.8rem;
  color: var(--muted);
}
.ranch-feed-amount {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 14px 0 9px;
}
.ranch-feed-amount > span:first-child {
  color: #729752;
  font-size: 1.7rem;
}
.ranch-feed-amount strong {
  font-size: 1.8rem;
}
.ranch-feed-amount span {
  font-size: 0.8rem;
  color: var(--muted);
}
progress {
  width: 100%;
  height: 7px;
  border: 0;
  appearance: none;
  border-radius: 9px;
  overflow: hidden;
  background: var(--raised);
}
progress::-webkit-progress-bar {
  background: var(--raised);
}
progress::-webkit-progress-value {
  background: #94b76c;
  border-radius: 9px;
}
progress::-moz-progress-bar {
  background: #94b76c;
}
.ranch-feed-buttons {
  display: flex;
  gap: 8px;
  margin: 16px 0 10px;
}
.ranch-feed-buttons button {
  flex: 1;
  padding: 7px 4px;
  font-size: 0.85rem;
}
.ranch-feed-buttons small {
  display: block;
  color: var(--muted);
  font-weight: 400;
  font-size: 0.65rem;
}
.ranch-feed > small {
  font-size: 0.7rem;
  color: var(--muted);
}
.ranch-mini-animals {
  display: flex;
  gap: 18px;
  margin-top: 26px;
  justify-content: center;
}
.ranch-mini-animals img {
  width: 50px;
  height: 50px;
  object-fit: contain;
}
.ranch-detail-portrait {
  margin: 14px auto;
  text-align: center;
}
.ranch-detail-portrait img {
  height: 70px;
  width: 70px;
  object-fit: contain;
}
.ranch-animal-detail .actions {
  margin-top: 16px;
}
.ranch-workshop {
  padding: 0;
  overflow: hidden;
  margin-bottom: 22px;
}
.ranch-tabs {
  display: flex;
  gap: 6px;
  border-bottom: 1px solid var(--line);
  padding: 12px 18px;
}
.ranch-tabs button {
  border: 0;
  background: none;
  font-size: 0.85rem;
  min-height: 44px;
}
.ranch-tabs button.active {
  background: var(--ranch-light);
  color: var(--ranch-green);
}
.ranch-shop-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  padding: 22px;
  gap: 16px;
}
.ranch-shop-animal {
  border: 1px solid var(--line);
  border-radius: 16px;
  padding: 18px 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  position: relative;
}
.ranch-shop-animal img {
  width: 64px;
  height: 64px;
  object-fit: contain;
  margin: 18px 0 12px;
}
.ranch-shop-animal p {
  font-size: 0.75rem;
  color: var(--muted);
  margin: 5px 0 12px;
}
.ranch-shop-lock {
  font-size: 0.6rem;
  background: var(--raised);
  padding: 3px 7px;
  border-radius: 7px;
  position: absolute;
  left: 10px;
  top: 9px;
  color: var(--muted);
}
.ranch-shop-meta {
  font-size: 0.65rem;
  color: var(--muted);
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 5px;
  margin-bottom: 15px;
}
.ranch-shop-animal button {
  font-size: 0.72rem;
  width: 100%;
  padding: 9px 4px;
  min-height: 44px;
}
.ranch-shop-animal.locked img {
  filter: grayscale(0.65);
  opacity: 0.6;
}
.ranch-shop-filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  padding: 18px 22px 0;
}
.ranch-shop-filters > div {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
}
.ranch-shop-filters button {
  font-size: 0.72rem;
  min-height: 44px;
}
.ranch-shop-filters button.active {
  background: var(--ranch-light);
  color: var(--ranch-green);
}
.ranch-shop-filters > input {
  width: 160px;
  font-size: 0.8rem;
  padding: 8px 12px;
}
.ranch-shop-filters label {
  font-size: 0.75rem;
  display: flex;
  align-items: center;
  gap: 5px;
}
.ranch-shop-filters label input {
  width: 16px;
  height: 16px;
}
.ranch-shop-filters > span {
  font-size: 0.7rem;
}
.ranch-animal-description {
  min-height: 34px;
  line-height: 1.5;
  font-size: 0.68rem !important;
}
.ranch-inventory {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  padding: 24px;
}
.ranch-product {
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 16px;
  text-align: center;
}
.ranch-product > span {
  font-size: 0.8rem;
}
.ranch-product strong {
  display: block;
  font-size: 1.6rem;
  margin: 9px;
}
.ranch-product strong small {
  font-size: 0.65rem;
  color: var(--muted);
}
.ranch-product p {
  font-size: 0.7rem;
  color: var(--muted);
}
.ranch-sell-all {
  grid-column: 1/-1;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.ranch-sell-all p {
  font-size: 0.8rem;
  color: var(--muted);
}
.ranch-sell-all strong {
  color: var(--text);
}
.ranch-neighbors {
  padding: 22px;
}
.ranch-neighbors > .muted {
  font-size: 0.8rem;
  margin-top: 0;
}
.ranch-bottom {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 22px;
}
.ranch-expand p {
  font-size: 0.85rem;
  color: var(--muted);
}
.ranch-expand .eyebrow {
  color: var(--muted);
  font-size: 0.6rem;
  margin-bottom: 9px;
}
.ranch-log {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 0;
  border-bottom: 1px solid var(--line);
  font-size: 0.8rem;
}
.ranch-log small {
  font-size: 0.65rem;
  color: var(--muted);
  white-space: nowrap;
}
.ranch-loading {
  padding: 60px;
  text-align: center;
  color: var(--muted);
}
:global([data-theme="dark"]) .ranch-scene {
  background-blend-mode: multiply;
  background-color: #87a279;
}
:global([data-theme="dark"]) .ranch-tabs button.active {
  background: #2c3d28;
  color: #d0e8a9;
}
@keyframes animal-idle {
  0%,
  100% {
    transform: translateY(0) rotate(-2deg);
  }
  50% {
    transform: translateY(-5px) rotate(2deg);
  }
}
@media (max-width: 900px) {
  .ranch-main {
    grid-template-columns: 1fr;
  }
  .ranch-side {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }
  .ranch-shop-grid {
    gap: 10px;
    padding: 16px;
  }
  .ranch-summary > div {
    padding: 14px;
  }
  .ranch-summary small {
    font-size: 0.65rem;
  }
}
@media (max-width: 600px) {
  .ranch-page {
    padding-top: 18px;
  }
  .ranch-heading {
    display: block;
  }
  .ranch-heading-actions {
    margin-top: 16px;
  }
  .ranch-back {
    margin-bottom: 12px;
  }
  .ranch-summary {
    grid-template-columns: 1fr 1fr;
    gap: 9px;
  }
  .ranch-summary > div {
    padding: 12px 14px;
  }
  .ranch-summary strong {
    font-size: 1.45rem;
  }
  .ranch-main {
    gap: 14px;
  }
  .ranch-side {
    grid-template-columns: 1fr;
  }
  .ranch-scene {
    min-height: 300px;
  }
  .ranch-large {
    min-height: 450px;
  }
  .ranch-field-animal img {
    height: 49px;
    width: 49px;
  }
  .ranch-field-animal.young img {
    height: 40px;
    width: 40px;
  }
  .ranch-field-grid {
    gap: 15px 2px;
    inset: 32% 3% 6%;
  }
  .ranch-field-animal {
    min-height: 78px;
  }
  .animal-shadow {
    top: 50px;
    width: 42px;
  }
  .animal-caption {
    font-size: 0.65rem;
    padding: 1px 5px;
  }
  .animal-caption small {
    display: none;
  }
  .ranch-scene-title,
  .ranch-scene-footer {
    padding: 13px 14px;
  }
  .ranch-scene-title > span {
    font-size: 0.65rem;
  }
  .ranch-scene-footer p {
    max-width: 155px;
    font-size: 0.65rem;
  }
  .ranch-scene-footer button {
    font-size: 0.75rem;
    padding: 10px;
  }
  .ranch-shop-grid {
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    padding: 14px;
  }
  .ranch-tabs {
    padding: 8px;
    gap: 0;
  }
  .ranch-tabs button {
    font-size: 0.75rem;
    padding: 8px 12px;
  }
  .ranch-inventory {
    grid-template-columns: 1fr 1fr;
    padding: 14px;
    gap: 10px;
  }
  .ranch-neighbors {
    padding: 15px;
  }
  .ranch-bottom {
    grid-template-columns: 1fr;
    gap: 14px;
  }
  .ranch-heading-actions button {
    min-height: 44px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .ranch-field-animal img {
    animation: none;
  }
}

.scene-page {
  --ranch-ink: #544328;
  --ranch-green: #447432;
  --ranch-button: #d6e58f;
  color: #574b30;
  padding-top: 18px;
  max-width: 1320px;
}
.scene-heading {
  margin-bottom: 16px;
  align-items: center;
  flex-direction: row;
  display: flex;
}
.scene-heading h1 {
  font-size: 2rem;
  letter-spacing: 0;
  margin: 8px 0 3px;
  color: #567036;
  text-shadow: 1px 2px #e9e5c7;
}
.scene-heading p {
  font-size: 13px;
}
.ranch-hud {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 12px;
  background: #fff3d4;
  border: 2px solid #c7aa74;
  border-radius: 14px;
  padding: 9px 16px;
  color: #695132;
  font-size: 14px;
  font-weight: 700;
}
.ranch-hud button {
  background: #e2edbb;
  border: 1px solid #b1c47a;
  border-radius: 10px;
  min-height: 44px;
  color: #4f652f;
  padding: 7px 13px;
}
.ranch-hud .hungry {
  background: #ffe4aa;
  color: #925c2f;
}
.hud-level {
  min-width: 130px;
}
.hud-level progress {
  display: block;
  height: 6px;
  width: 130px;
  margin-top: 4px;
  accent-color: #6a9e42;
}
.hud-coin {
  color: #a36d19;
}
.ranch-toolbelt {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 10px;
  background: linear-gradient(#d5b88a, #bd986b);
  padding: 10px;
  border: 2px solid #92704b;
  border-radius: 16px;
  margin-top: 10px;
  box-shadow: 0 5px 0 #8f6d49;
}
.ranch-toolbelt button {
  min-height: 80px;
  background: linear-gradient(#fff6dd, #efddaa);
  border: 2px solid #e4c590;
  border-radius: 12px;
  color: #5e492b;
  font-weight: 800;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  font-size: 14px;
  box-shadow: 0 2px 0 #a58253;
  cursor: pointer;
}
.ranch-toolbelt button:hover {
  background: #fff8e5;
  transform: translateY(-2px);
}
.ranch-toolbelt button:active {
  transform: translateY(1px);
}
.ranch-toolbelt button:disabled {
  opacity: 0.6;
  transform: none;
}
.ranch-toolbelt button > span {
  font-size: 28px;
}
.ranch-toolbelt small {
  font-size: 11px;
  font-weight: 500;
  color: #907650;
}
.ranch-footnote {
  color: var(--muted);
  text-align: center;
  font-size: 12px;
  margin: 20px 0;
}
:global(dialog.ranch-window) {
  width: min(900px, calc(100% - 24px));
  max-height: 84dvh;
  padding: 20px;
  border: 3px solid #b19161;
  border-radius: 18px;
  background: #fff5dc;
  color: #5d4b30;
  box-sizing: border-box;
  overflow: auto;
}
:global(dialog.ranch-window::backdrop) {
  background: #253a24a3;
}
.ranch-window-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  position: sticky;
  top: -20px;
  background: #fff5dc;
  z-index: 2;
  padding: 10px 0;
  border-bottom: 1px solid #dec9a1;
  margin-bottom: 15px;
}
.ranch-window-heading h2 {
  margin: 0;
  font-size: 1.25rem;
  color: #556e34;
}
.ranch-window .card {
  background: transparent;
  border: none;
  padding: 10px;
  box-shadow: none;
  color: inherit;
}
.ranch-window button.quiet,
.ranch-window button {
  color: #5d4b30;
}
.ranch-window .ranch-primary {
  background: #d4e393;
  border-color: #a9be66;
  color: #465f29;
  min-height: 44px;
}
.ranch-window .muted,
.ranch-window p,
.ranch-window small {
  color: #806e4e;
}
.ranch-window input {
  background: #fffdf1;
  color: #604d32;
  border-color: #cdb688;
  max-width: 100%;
}
.ranch-window .ranch-tabs {
  display: none;
}
.ranch-window .ranch-shop-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}
.ranch-window .ranch-shop-animal {
  background: #fffaf0;
  border-color: #e1cba1;
  color: #58482f;
  padding: 12px;
  min-width: 0;
}
.shop-fullbody {
  width: 120px;
  height: 120px;
  margin: 5px auto;
}
.ranch-window .ranch-detail-portrait {
  width: 190px;
  height: 190px;
  margin: 0 auto;
}
.ranch-window .ranch-shop-lock {
  position: static;
  display: block;
  background: #f4e5bd;
  color: #846a42;
}
.ranch-window .ranch-shop-filters > div {
  flex-wrap: wrap;
}
.ranch-window .ranch-shop-filters {
  gap: 8px;
}
.ranch-window .ranch-shop-filters input[type="search"] {
  flex-basis: 100%;
  min-width: 0;
}
.ranch-window .ranch-shop-animal h3 {
  color: #56713d;
}
.ranch-window .ranch-animal-description {
  font-size: 12px;
  min-height: 36px;
}
.ranch-window .ranch-shop-meta {
  font-size: 11px;
}
.ranch-window .ranch-bottom {
  display: block;
  margin: 0;
}
.ranch-window .ranch-product {
  background: #fff8e9;
  border-color: #d4bd90;
}
.ranch-window .ranch-feed-buttons button {
  background: #fff9e8;
  border-color: #d4bd90;
  min-height: 60px;
}
.ranch-window .player-line {
  border-color: #dbc7a1;
}
.ranch-window .avatar {
  background: #e2d5ac;
  color: #7b6842;
}
.ranch-window .tag {
  background: #ecdfb8;
  border-color: #cdb889;
  color: #7c6946;
}
:global([data-theme="dark"]) .scene-page {
  color: #e8dbbd;
}
:global([data-theme="dark"]) .scene-heading h1 {
  color: #d9dea6;
  text-shadow: none;
}
:global([data-theme="dark"] dialog.ranch-window) {
  background: #352f26;
  color: #f1dfb6;
  border-color: #8d724c;
}
:global([data-theme="dark"]) .ranch-window-heading {
  background: #352f26;
}
:global([data-theme="dark"]) .ranch-window-heading h2 {
  color: #d5df9b;
}
:global([data-theme="dark"]) .ranch-window .ranch-shop-animal,
:global([data-theme="dark"]) .ranch-window .ranch-product,
:global([data-theme="dark"]) .ranch-window input {
  background: #433b2e;
  color: #f1dfb6;
  border-color: #756047;
}
:global([data-theme="dark"]) .ranch-window p,
:global([data-theme="dark"]) .ranch-window small,
:global([data-theme="dark"]) .ranch-window button.quiet {
  color: #dac9aa;
}
:global([data-theme="dark"]) .ranch-window .ranch-shop-animal h3 {
  color: #d5df9b;
}
@media (max-width: 900px) {
  .ranch-window .ranch-shop-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
@media (max-width: 640px) {
  .scene-page {
    padding-top: 12px;
  }
  .scene-heading h1 {
    font-size: 1.65rem;
  }
  .scene-heading p {
    max-width: 230px;
    line-height: 1.5;
  }
  .scene-heading {
    align-items: start;
  }
  .ranch-hud {
    gap: 8px;
    padding: 8px 10px;
    font-size: 12px;
    justify-content: space-between;
  }
  .hud-level {
    min-width: 100px;
  }
  .hud-level progress {
    width: 100px;
  }
  .ranch-hud button {
    padding: 4px 8px;
  }
  .ranch-toolbelt {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 7px;
    padding: 7px;
  }
  .ranch-toolbelt button {
    min-height: 70px;
    font-size: 12px;
  }
  .ranch-toolbelt button > span {
    font-size: 24px;
  }
  .ranch-toolbelt small {
    font-size: 10px;
  }
  .ranch-window .ranch-shop-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  .ranch-window .ranch-shop-animal {
    padding: 8px;
  }
  .shop-fullbody {
    width: 100px;
    height: 100px;
  }
  .ranch-window .ranch-shop-animal .ranch-primary {
    font-size: 11px;
    padding: 7px 3px;
  }
  .ranch-window .ranch-shop-meta {
    display: block;
  }
  .ranch-window .ranch-shop-meta span {
    display: block;
  }
  .ranch-window .ranch-neighbors .player-line {
    flex-wrap: wrap;
  }
  .ranch-window .details {
    min-width: 100px;
  }
  :global(dialog.ranch-window) {
    padding: 12px;
    max-height: 88dvh;
  }
  .ranch-window-heading {
    top: -12px;
  }
  .ranch-window .ranch-shop-filters > div {
    display: flex;
    gap: 4px;
  }
  .ranch-window .ranch-shop-filters > div button {
    font-size: 11px;
    padding: 6px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .ranch-toolbelt button:hover {
    transform: none;
  }
}

.ranch-window button{min-height:44px}
.ranch-window .ranch-shop-filters label{display:flex;align-items:center;min-height:44px;gap:8px}
:global([data-theme="dark"] .ranch-window .ranch-window-heading){background:#352f26}
:global([data-theme="dark"] .ranch-window .ranch-window-heading h2){color:#d9e2a8}
:global([data-theme="dark"] .ranch-window .ranch-shop-animal),
:global([data-theme="dark"] .ranch-window .ranch-product){background:#473e30;border-color:#8c7653;color:#f6e8c7}
:global([data-theme="dark"] .ranch-window input){background:#473e30;color:#f6e8c7;border-color:#8c7653}
:global([data-theme="dark"] .ranch-window p),
:global([data-theme="dark"] .ranch-window small),
:global([data-theme="dark"] .ranch-window .muted){color:#dccba9}
:global([data-theme="dark"] .ranch-window button.quiet){color:#f6e8c7}
:global([data-theme="dark"] .ranch-window .ranch-shop-animal h3){color:#d9e2a8}
:global([data-theme="dark"] .ranch-window .ranch-shop-lock){background:#5d5038;color:#f0ddae}
:global([data-theme="dark"] .ranch-window .ranch-shop-filters button){background:#574931;color:#f0ddae;border-color:#8c7653}
</style>
