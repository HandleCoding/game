<script setup lang="ts">
import RanchScene from "./RanchScene.vue";
import RanchLoading from "./RanchLoading.vue";
import AnimalPortrait from "./AnimalPortrait.vue";
import RanchIcon from "./RanchIcon.vue";
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
const sceneReady = ref(false);
const profile = ref<RanchProfile | null>(null),
  neighbors = ref<RanchNeighbor[]>([]),
  visiting = ref<string | null>(null);
const panel = ref<
    | "animals"
    | "store"
    | "neighbors"
    | "feed"
    | "detail"
    | "journal"
    | "help"
    | "album"
    | null
  >(null),
  busy = ref(false),
  loading = ref(false),
  error = ref(""),
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
  panel.value = null;
  visiting.value = id;
  chosen.value = null;
  sceneReady.value = false;
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
  const minutes = Math.max(0, Math.ceil(ms / 60000));
  if (minutes >= 1440)
    return (
      Math.floor(minutes / 1440) +
      "天" +
      (minutes % 1440 >= 60 ? Math.floor((minutes % 1440) / 60) + "小时" : "")
    );
  if (minutes >= 60)
    return (
      Math.floor(minutes / 60) +
      "小时" +
      (minutes % 60 ? (minutes % 60) + "分" : "")
    );
  return minutes ? minutes + "分" : "即将完成";
}
function countdown(a: NonNullable<typeof selected.value>) {
  if (a.stored >= a.capacity) return "产物已存满，收获后继续";
  if (a.hungry) return "补粮后还需 " + duration(a.remainingMs);
  return a.nextAt
    ? duration(a.nextAt - now.value)
    : duration(a.remainingMs) + " · 记得途中补粮";
}
function animalStatus(a: NonNullable<typeof selected.value>) {
  if (a.stored > 0) return "可收获 " + a.stored + " 份";
  if (a.hungry) return "肚子饿了";
  if (a.nextAt && a.nextAt <= now.value) return "正在确认产出…";
  return a.baby ? "幼崽成长中" : "悠闲产出中";
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
const gameRoot = ref<HTMLElement | null>(null);
const theme = ref(document.documentElement.dataset.theme || "light");
const canFullscreen = document.fullscreenEnabled;
function syncTheme() {
  theme.value = document.documentElement.dataset.theme || "light";
}
function toggleTheme() {
  window.playroomTheme.toggle();
}
async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    notify("当前浏览器暂不支持全屏，已使用铺满页面的游戏模式");
  }
}
function returnLobby() {
  if (document.fullscreenElement)
    void document.exitFullscreen().catch(() => {});
  closePersistent();
}
onMounted(() => window.addEventListener("playroom-theme-change", syncTheme));
onUnmounted(() =>
  window.removeEventListener("playroom-theme-change", syncTheme),
);
const panelTitle = computed(
  () =>
    ({
      help: "牧场玩法说明",
      animals: "动物商店",
      store: "我的仓库",
      neighbors: "串门看看",
      feed: "食槽 · 自动喂养",
      detail: selected.value?.name || "动物伙伴",
      journal: "扩建与牧场日记",
      album: "动物图鉴",
    })[panel.value || "animals"],
);
function selectAnimal(id: string) {
  chosen.value = id;
  panel.value = "detail";
}
watch([panel, sceneReady], async ([value, ready]) => {
  if (value !== "detail") chosen.value = null;
  if (!ready) panelDialog.value?.close();
  await nextTick();
  if (panel.value && sceneReady.value && !panelDialog.value?.open)
    panelDialog.value?.showModal();
});

const pickedSpecies = ref<RanchSpecies | null>(null);
const previewBaby = ref(false);
const pickedProduct = ref<string | null>(null);
const neighborSearch = ref("");
const neighborSort = ref("level");
const shopChoice = computed(
  () =>
    filteredSpecies.value.find((k) => k.id === pickedSpecies.value) ||
    filteredSpecies.value[0],
);
const inventory = computed(
  () => farm.value?.inventory?.filter((p) => p.count > 0) || [],
);
const productChoice = computed(
  () =>
    inventory.value.find((p) => p.id === pickedProduct.value) ||
    inventory.value[0],
);
const inventoryCount = computed(() =>
  inventory.value.reduce((n, p) => n + p.count, 0),
);
const availableSpecies = computed(
  () =>
    farm.value?.species.filter((k) => k.unlockLevel <= farm.value!.level)
      .length || 0,
);
const filteredNeighbors = computed(() =>
  neighbors.value
    .filter((p) => p.name.includes(neighborSearch.value.trim()))
    .sort((a, b) =>
      neighborSort.value === "level"
        ? b.level - a.level
        : a.name.localeCompare(b.name, "zh-CN"),
    ),
);
const adoptionReason = computed(() => {
  const k = shopChoice.value;
  if (!k) return "";
  if (farm.value!.level < k.unlockLevel)
    return "Lv. " + k.unlockLevel + " 解锁";
  if (farm.value!.animals.length >= farm.value!.capacity)
    return "位置已满 · 先扩建牧场";
  if ((farm.value!.coins || 0) < k.price) return "金币不足";
  return k.price + " 金币 · 认养";
});
function productAnimal(id: string) {
  return farm.value?.species.find((k) => k.product === id);
}
</script>

<template>
  <main
    ref="gameRoot"
    class="ranch-page scene-page immersive-ranch"
    aria-label="一起牧场游戏"
  >
    <RanchLoading
      v-if="!farm"
      pending
      :failed="!!error"
      @retry="load"
      @leave="returnLobby"
    />
    <template v-else>
      <RanchScene
        :animals="farm.animals"
        :chosen="chosen"
        :owner="owner"
        :feed="owner ? farm.feed : undefined"
        :hungry="farm.hungry"
        :effect="sceneEffect"
        @loading="sceneReady = !$event"
        @leave="returnLobby"
        @select="selectAnimal"
        @feed="panel = 'feed'"
        @shop="panel = 'animals'"
      />
      <div v-if="sceneReady" style="display: contents">
        <header class="game-profile">
          <div class="ranch-avatar" aria-hidden="true">
            <RanchIcon :index="1" />
          </div>
          <div class="profile-text">
            <h1>
              {{
                visiting
                  ? (profile?.ownerName || "玩家") + "的牧场"
                  : state?.me.name + "的牧场"
              }}
            </h1>
            <span class="profile-level"
              >Lv. {{ farm.level }}
              <small
                >{{ farm.animals.length }} / {{ farm.capacity }} 伙伴</small
              ></span
            >
            <progress
              v-if="owner"
              :value="(farm.xp || 0) - (farm.levelStartXp || 0)"
              :max="(farm.nextLevelXp || 1) - (farm.levelStartXp || 0)"
              :title="
                '本级经验 ' +
                ((farm.xp || 0) - (farm.levelStartXp || 0)) +
                ' / ' +
                ((farm.nextLevelXp || 1) - (farm.levelStartXp || 0))
              "
              aria-label="牧场经验"
            ></progress>
          </div>
        </header>
        <div class="game-wallet">
          <span v-if="owner" class="wallet-coins" aria-label="我的金币"
            ><RanchIcon :index="7" />{{ farm.coins }}</span
          >
          <span v-else class="visitor-label">参观中</span>
          <button
            v-if="owner"
            class="wallet-feed"
            :class="{ hungry: farm.hungry }"
            @click="panel = 'feed'"
          >
            <RanchIcon :index="8" />{{ farm.feed }} 份
          </button>
          <button v-else class="wallet-feed" @click="visit(null)">
            回我的牧场
          </button>
        </div>
        <nav class="game-side-actions" aria-label="游戏菜单">
          <button aria-label="返回游戏大厅" @click="returnLobby">
            <span>↩</span><small>大厅</small>
          </button>
          <button
            :aria-label="
              theme === 'light' ? '切换到夜间模式' : '切换到日间模式'
            "
            @click="toggleTheme"
          >
            <span>{{ theme === "light" ? "☾" : "☀" }}</span
            ><small>{{ theme === "light" ? "夜间" : "日间" }}</small>
          </button>
          <button
            class="album-menu"
            aria-label="动物图鉴"
            @click="panel = 'album'"
          >
            <RanchIcon :index="6" /><small>图鉴</small>
          </button>
          <button aria-label="牧场玩法说明" @click="panel = 'help'">
            <span>?</span><small>玩法</small>
          </button>
          <button
            v-if="canFullscreen"
            aria-label="切换游戏全屏"
            @click="toggleFullscreen"
          >
            <span>⛶</span><small>全屏</small>
          </button>
        </nav>
        <nav class="ranch-toolbelt" aria-label="牧场工具栏">
          <button
            v-if="owner"
            :disabled="busy || loading || !harvestCount"
            @click="action('harvest')"
          >
            <span class="tool-art"><RanchIcon :index="0" /></span
            ><span class="tool-name">一键收获</span
            ><small class="tool-count" v-if="harvestCount">{{
              harvestCount
            }}</small>
          </button>
          <button @click="panel = 'animals'">
            <span class="tool-art"><RanchIcon :index="1" /></span
            ><span class="tool-name">动物商店</span>
          </button>
          <button v-if="owner" @click="panel = 'feed'">
            <span class="tool-art"><RanchIcon :index="2" /></span
            ><span class="tool-name">添饲料</span
            ><small class="tool-count alert-count" v-if="farm.hungry">!</small>
          </button>
          <button v-if="owner" @click="panel = 'store'">
            <span class="tool-art"><RanchIcon :index="3" /></span
            ><span class="tool-name">我的仓库</span
            ><small class="tool-count" v-if="stockValue">●</small>
          </button>
          <button @click="panel = 'neighbors'">
            <span class="tool-art"><RanchIcon :index="4" /></span
            ><span class="tool-name">去串门</span>
          </button>
          <button v-if="owner" @click="panel = 'journal'">
            <span class="tool-art"><RanchIcon :index="5" /></span
            ><span class="tool-name">扩建 / 日记</span>
          </button>
        </nav>
        <span class="game-offline-note">{{
          owner ? "离线也会成长 · 缺粮暂停" : "只读参观 · 动物状态实时刷新"
        }}</span>
      </div>
    </template>
    <div v-if="error && farm" class="game-error" role="alert">
      {{ error }}<button :disabled="busy || loading" @click="load">重试</button>
    </div>
  </main>
  <Teleport to="body">
    <dialog
      v-if="panel && farm"
      ref="panelDialog"
      class="ranch-window"
      :class="{
        'catalog-window': panel === 'animals' || panel === 'album',
        'store-window': panel === 'store',
      }"
      aria-labelledby="ranch-window-title"
      @cancel.prevent="panel = null"
      @click="
        (e) => {
          if (e.target === panelDialog) panel = null;
        }
      "
    >
      <div class="ranch-window-heading">
        <span class="window-emblem" aria-hidden="true"
          ><RanchIcon
            :index="
              panel === 'animals'
                ? 1
                : panel === 'store'
                  ? 3
                  : panel === 'neighbors'
                    ? 4
                    : panel === 'feed'
                      ? 2
                      : panel === 'journal'
                        ? 5
                        : 6
            "
        /></span>
        <h2 id="ranch-window-title">{{ panelTitle }}</h2>
        <button
          class="window-close"
          aria-label="关闭牧场面板"
          @click="panel = null"
        >
          ✕
        </button>
      </div>
      <p v-if="error" role="alert" class="error panel-error">{{ error }}</p>
      <template v-if="panel === 'animals' || panel === 'album'">
        <div class="ranch-shop-filters">
          <div class="wood-tabs" aria-label="动物分类">
            <button
              v-for="c in [
                { id: 'all', name: '全部' },
                { id: 'farm', name: '家禽家畜' },
                { id: 'pets', name: '萌宠' },
                { id: 'zoo', name: '动物园' },
              ]"
              :key="c.id"
              :class="{ active: shopCategory === c.id }"
              :aria-pressed="shopCategory === c.id"
              @click="shopCategory = c.id"
            >
              {{ c.name }}
            </button>
          </div>
          <div class="catalog-search">
            <input
              v-model="search"
              type="search"
              aria-label="搜索动物"
              placeholder="搜索动物名字"
            /><label
              ><input v-model="unlockedOnly" type="checkbox" />已解锁</label
            >
          </div>
          <div class="catalog-summary">
            <span>{{
              panel === "album"
                ? "已解锁 " +
                  availableSpecies +
                  " / " +
                  farm.species.length +
                  " 种"
                : "认养幼崽，陪它慢慢长大"
            }}</span
            ><span v-if="panel === 'animals'"
              >{{ farm.animals.length }} / {{ farm.capacity }} 位置</span
            ><span v-else>幼年 / 成年可切换</span>
          </div>
        </div>
        <div class="catalog-layout">
          <div class="ranch-shop-grid panel-scroll" aria-label="动物列表">
            <button
              v-for="kind in filteredSpecies"
              :key="kind.id"
              type="button"
              class="ranch-shop-animal item-tile"
              :class="{
                'tile-is-locked': farm.level < kind.unlockLevel,
                selected: shopChoice?.id === kind.id,
              }"
              :aria-pressed="shopChoice?.id === kind.id"
              :aria-label="'查看' + kind.name + '资料'"
              @click="pickedSpecies = kind.id"
            >
              <span class="tile-level">Lv. {{ kind.unlockLevel }}</span>
              <div class="shop-fullbody">
                <AnimalPortrait :species="kind.id" :name="kind.name" />
              </div>
              <strong>{{ kind.name }}</strong>
              <span class="tile-price" v-if="panel === 'animals'"
                ><RanchIcon :index="7" />{{ kind.price }}</span
              ><small v-else>{{ kind.productName }}</small>
              <span v-if="farm.level < kind.unlockLevel" class="tile-lock"
                ><svg viewBox="0 0 20 24" aria-hidden="true" class="flat-lock">
                  <path
                    d="M5 10V7a5 5 0 0 1 10 0v3"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="3"
                    stroke-linecap="round"
                  />
                  <rect
                    x="2"
                    y="10"
                    width="16"
                    height="13"
                    rx="3"
                    fill="currentColor"
                  />
                  <circle cx="10" cy="15" r="1.5" fill="#8d805a" />
                  <path
                    d="M10 16v3"
                    stroke="#8d805a"
                    stroke-width="1.7"
                    stroke-linecap="round"
                  /></svg
                >Lv. {{ kind.unlockLevel }} 解锁</span
              >
            </button>
            <p v-if="!filteredSpecies.length" class="empty">
              没找到这位伙伴，换个名字试试吧。
            </p>
          </div>
          <aside
            v-if="shopChoice"
            class="item-detail catalog-detail"
            aria-label="动物资料"
          >
            <div class="detail-overview">
              <div class="detail-art meadow-art">
                <AnimalPortrait
                  :species="shopChoice.id"
                  :name="shopChoice.name"
                  :baby="previewBaby"
                />
              </div>
              <div class="detail-title">
                <span class="detail-kicker">{{
                  previewBaby ? "幼年伙伴" : "成年伙伴"
                }}</span>
                <h3>
                  {{ previewBaby ? shopChoice.babyName : shopChoice.name }}
                </h3>
                <div class="stage-switch">
                  <button
                    :aria-pressed="previewBaby"
                    :class="{ active: previewBaby }"
                    @click="previewBaby = true"
                  >
                    幼年</button
                  ><button
                    :aria-pressed="!previewBaby"
                    :class="{ active: !previewBaby }"
                    @click="previewBaby = false"
                  >
                    成年
                  </button>
                </div>
              </div>
            </div>
            <div class="detail-copy">
              <p>{{ shopChoice.description }}</p>
              <div class="detail-facts">
                <span
                  >长大需时<strong>{{
                    duration(shopChoice.growthMs)
                  }}</strong></span
                ><span
                  >产出周期<strong>{{
                    duration(shopChoice.cycleMs)
                  }}</strong></span
                ><span
                  >{{ shopChoice.productName
                  }}<strong>{{ shopChoice.yield }} 份 / 轮</strong></span
                >
              </div>
            </div>
            <div class="detail-actions" v-if="panel === 'animals' && owner">
              <button
                class="ranch-primary"
                :disabled="
                  busy ||
                  loading ||
                  farm.level < shopChoice.unlockLevel ||
                  (farm.coins || 0) < shopChoice.price ||
                  farm.animals.length >= farm.capacity
                "
                @click="buy(shopChoice.id)"
              >
                {{ adoptionReason }}
              </button>
            </div>
            <p v-else class="detail-footnote">
              {{
                farm.level < shopChoice.unlockLevel
                  ? "牧场达到 Lv. " + shopChoice.unlockLevel + " 后可以认养。"
                  : "已解锁 · 在动物商店认养幼崽"
              }}
            </p>
          </aside>
        </div>
      </template>
      <template v-else-if="panel === 'store' && owner">
        <div class="wood-tabs store-tabs">
          <span class="active">动物产物</span
          ><span>{{ inventory.length }} 种 · {{ inventoryCount }} 份</span>
        </div>
        <div class="catalog-layout">
          <div class="ranch-inventory panel-scroll">
            <button
              v-for="product in inventory"
              :key="product.id"
              class="ranch-product item-tile"
              :class="{ selected: productChoice?.id === product.id }"
              :aria-pressed="productChoice?.id === product.id"
              :aria-label="'查看' + product.name + '库存'"
              @click="pickedProduct = product.id"
            >
              <div class="product-art">
                <AnimalPortrait
                  v-if="productAnimal(product.id)"
                  :species="productAnimal(product.id)!.id"
                  :name="product.name"
                /><RanchIcon v-else :index="0" />
              </div>
              <strong>{{ product.name }}</strong
              ><span class="product-count">× {{ product.count }}</span>
            </button>
            <p v-if="!stockValue" class="empty">
              <RanchIcon :index="0" />仓库还是空的<br />先去收获动物的产物吧。
            </p>
          </div>
          <aside class="item-detail inventory-detail" aria-label="库存详情">
            <template v-if="productChoice"
              ><div class="detail-overview">
                <div class="detail-art meadow-art">
                  <AnimalPortrait
                    v-if="productAnimal(productChoice.id)"
                    :species="productAnimal(productChoice.id)!.id"
                    :name="productChoice.name"
                  /><RanchIcon v-else :index="0" />
                </div>
                <div class="detail-title">
                  <span class="detail-kicker">来自牧场伙伴的礼物</span>
                  <h3>{{ productChoice.name }}</h3>
                  <p>库存 {{ productChoice.count }} 份</p>
                </div>
              </div>
              <div class="detail-facts">
                <span
                  >出售单价<strong>{{ productChoice.price }} 金币</strong></span
                ><span
                  >本项总值<strong
                    >{{
                      productChoice.count * productChoice.price
                    }}
                    金币</strong
                  ></span
                >
              </div>
              <button
                class="ranch-primary"
                :disabled="busy || loading || !productChoice.count"
                @click="action('sellProducts', { product: productChoice.id })"
              >
                出售此产物 · {{ productChoice.count }} 份
              </button>
            </template>
            <div class="ranch-sell-all">
              <p>
                仓库估值 <strong>{{ stockValue }} 金币</strong>
              </p>
              <button
                class="ranch-secondary"
                :disabled="busy || loading || !stockValue"
                @click="action('sellProducts')"
              >
                出售全部产物
              </button>
            </div>
          </aside>
        </div>
      </template>
      <section
        v-else-if="panel === 'feed' && owner"
        class="ranch-feed panel-scroll"
      >
        <div class="feed-hero">
          <RanchIcon :index="2" /><span
            class="tag"
            :class="{ danger: farm.hungry }"
            >{{ farm.hungry ? "需要喂食" : "自动喂养" }}</span
          >
          <h3>{{ farm.feed }} <small>份饲料</small></h3>
        </div>
        <progress
          :value="farm.feed"
          max="1000"
          aria-label="食槽剩余饲料"
        ></progress>
        <p>
          {{
            farm.animals.length
              ? "当前伙伴可再吃约 " + duration((farm.feedMinutes || 0) * 60000)
              : "先认养一只小动物吧"
          }}。每只动物每 {{ farm.feedUnitMinutes }} 分钟吃 1 份。
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
            <RanchIcon :index="8" /><strong>+{{ units }}</strong
            ><small>{{ units }} 金币</small>
          </button>
        </div>
        <small>食槽最多容纳 1000 份；缺粮暂停成长，动物不会死亡。</small>
      </section>
      <section
        v-else-if="panel === 'detail'"
        class="ranch-animal-detail panel-scroll"
      >
        <template v-if="selected"
          ><div class="animal-detail-stage">
            <span class="tag">{{
              selected.baby ? "幼崽成长中" : "成年伙伴"
            }}</span>
            <div class="ranch-detail-portrait">
              <AnimalPortrait
                :species="selected.species"
                :name="selected.name"
                :baby="selected.baby"
              />
            </div>
            <strong class="animal-state">{{ animalStatus(selected) }}</strong>
          </div>
          <p v-if="!selected.hungry && selected.stored < selected.capacity">
            {{ selected.baby ? "距离成年" : "下次产出" }}：{{
              countdown(selected)
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
              class="ranch-secondary"
              :disabled="busy || loading || !!selected.stored"
              @click="sellAnimal"
            >
              出售动物
            </button>
          </div>
        </template>
        <p v-else class="empty">点一下场景里的伙伴，看看它的成长进度。</p>
      </section>
      <section
        v-else-if="panel === 'neighbors'"
        class="ranch-neighbors panel-scroll"
      >
        <div class="neighbor-filters">
          <input
            v-model="neighborSearch"
            type="search"
            aria-label="搜索牧场主"
            placeholder="搜昵称，去朋友家看看"
          /><select v-model="neighborSort" aria-label="牧场主排序">
            <option value="level">等级优先</option>
            <option value="name">昵称排序</option>
          </select>
        </div>
        <p class="panel-hint">所有牧场主都可以串门，离线也能参观。</p>
        <div
          v-for="player in filteredNeighbors"
          :key="player.id"
          class="player-line"
        >
          <div class="neighbor-avatar">
            {{ player.name.slice(0, 1) }}<span>Lv. {{ player.level }}</span>
          </div>
          <div class="details">
            <strong>{{ player.name }}</strong
            ><small>{{ player.animals }} 位动物伙伴</small>
          </div>
          <button
            class="ranch-primary"
            :disabled="busy || loading"
            @click="visit(player.id)"
          >
            参观牧场
          </button>
        </div>
        <p v-if="!filteredNeighbors.length" class="empty">
          {{
            neighbors.length
              ? "没找到这个昵称，换个关键词试试。"
              : "还没有其他牧场主，叫朋友来认养第一只小动物吧。"
          }}
        </p>
        <button class="ranch-secondary" @click="list">刷新玩家</button>
      </section>
      <section
        v-else-if="panel === 'journal' && owner"
        class="ranch-bottom panel-scroll"
      >
        <div class="ranch-expand">
          <RanchIcon :index="5" />
          <h3>给新伙伴一个位置</h3>
          <p>
            当前 {{ farm.capacity }} 个位置。每次扩建增加 2 个，最多 16 个。
          </p>
          <button
            class="ranch-primary"
            :disabled="
              busy ||
              loading ||
              !farm.upgradeCost ||
              (farm.coins || 0) < (farm.upgradeCost || 0) ||
              farm.level < (farm.upgradeLevel || 1)
            "
            @click="action('upgrade')"
          >
            {{
              farm.upgradeCost
                ? farm.level < (farm.upgradeLevel || 1)
                  ? "Lv. " +
                    farm.upgradeLevel +
                    " 可扩建 · " +
                    farm.upgradeCost +
                    " 金币"
                  : "扩建牧场 · " + farm.upgradeCost + " 金币"
                : "已完成全部扩建"
            }}
          </button>
        </div>
        <h3 class="journal-title">牧场日记</h3>
        <div
          v-for="entry in farm.log?.slice(0, 8)"
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
        <p v-if="!farm.log?.length">
          第一只小鸡正在等你。收获一次，故事就开始了。
        </p>
      </section>
      <section v-else-if="panel === 'help'" class="ranch-help panel-scroll">
        <h3>一群小伙伴，一块快乐草地</h3>
        <p>
          点动物或头顶状态查看详情；“可收获”表示产物已准备好。左侧围栏旁的食槽可以点击添粮，动物会过去吃。
        </p>
        <p>
          收获 → 仓库出售 → 认养幼崽 → 喂养成长。每只动物每 30 分钟吃 1
          份，缺粮暂停、不死亡，最多存 3 轮产物。
        </p>
        <p>
          36
          种伙伴按等级解锁，图鉴可以查看幼年与成年外观。拖动场景、双指缩放，右侧按钮可查看全景。
        </p>
        <p>
          小鸡 8 小时成年，成年后每 6
          小时产出；其他伙伴各有不同周期。升级经验逐级增加，仅收获获得经验，认养和扩建不加经验。
        </p>
        <p>离线时也会成长，多设备共用一份存档。串门为只读参观。</p>
      </section>
    </dialog>
  </Teleport>
</template>

<style scoped>
.immersive-ranch {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100dvh;
  z-index: 30;
  overflow: hidden;
  background: #b6d79b;
  color: #65462c;
}
.immersive-ranch *,
.ranch-window * {
  box-sizing: border-box;
}
.game-profile {
  position: absolute;
  top: max(16px, env(safe-area-inset-top));
  left: 18px;
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: calc(100% - 200px);
  padding: 8px 18px 8px 8px;
  border: 2px solid #eed3a0;
  border-radius: 38px 18px 18px 38px;
  background: linear-gradient(165deg, #dfaf78, #b88052);
  box-shadow:
    0 4px 0 #80523055,
    0 6px 15px #43332025;
  pointer-events: none;
}
.ranch-avatar {
  width: 62px;
  height: 62px;
  border-radius: 50%;
  background: radial-gradient(#fff5ca, #d8d992);
  border: 3px solid #f9e0a6;
  flex-shrink: 0;
  display: grid;
  place-items: center;
}
.ranch-avatar :deep(svg) {
  width: 54px;
  height: 54px;
}
.profile-text {
  min-width: 0;
  color: #fff5dd;
  text-shadow: 0 2px #815237;
}
.profile-text h1 {
  margin: 0 0 4px;
  font-size: 17px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.profile-level {
  font-weight: 800;
  font-size: 15px;
}
.profile-level small {
  font-size: 11px;
  margin-left: 8px;
  color: #fff2cd;
}
progress {
  appearance: none;
  -webkit-appearance: none;
  display: block;
  width: 100%;
  height: 12px;
  border: 2px solid #b7a167;
  background: #ccba8e;
  border-radius: 20px;
  overflow: hidden;
}
progress::-webkit-progress-bar {
  background: #b9a77f;
}
progress::-webkit-progress-value {
  background: linear-gradient(#c2ee61, #80b725);
  border-radius: 20px;
}
progress::-moz-progress-bar {
  background: #99c83b;
  border-radius: 20px;
}
.profile-text progress {
  height: 9px;
  min-width: 110px;
  margin-top: 5px;
  border-color: #9c7648;
}
.game-wallet {
  position: absolute;
  top: max(19px, env(safe-area-inset-top));
  right: 20px;
  display: grid;
  gap: 7px;
  min-width: 140px;
}
.wallet-coins,
.wallet-feed,
.visitor-label {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-height: 36px;
  padding: 2px 14px 2px 3px;
  border: 2px solid #dac19a;
  border-radius: 24px;
  color: #78502f;
  background: linear-gradient(#fff7dd, #f7e9bd);
  font-size: 17px;
  font-weight: 850;
  box-shadow: 0 3px 0 #72593a36;
}
.wallet-coins :deep(svg),
.wallet-feed :deep(svg) {
  width: 35px;
  height: 30px;
  flex-shrink: 0;
}
.wallet-feed {
  cursor: pointer;
  min-height: 44px;
  font-size: 14px;
}
.wallet-feed.hungry {
  border-color: #cd7747;
}
.game-side-actions {
  position: absolute;
  top: 124px;
  left: 20px;
  display: grid;
  gap: 12px;
}
.game-side-actions button {
  width: 54px;
  height: 58px;
  border: 2px solid #e0af70;
  border-radius: 50% 50% 40% 40%;
  background: linear-gradient(145deg, #e5b87b, #b87947);
  color: #fff1cb;
  box-shadow:
    inset 0 2px #ffe2a3,
    0 3px 0 #7d5035a1;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  padding: 3px;
  cursor: pointer;
}
.game-side-actions span {
  font-size: 26px;
  font-weight: 900;
  line-height: 28px;
}
.game-side-actions :deep(svg) {
  height: 32px;
  width: 36px;
}
.game-side-actions small {
  font-size: 10px;
  font-weight: 800;
  text-shadow: 0 1px #684023;
}
.ranch-toolbelt {
  position: absolute;
  bottom: max(14px, env(safe-area-inset-bottom));
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: end;
  justify-content: center;
  gap: 16px;
  max-width: calc(100% - 16px);
  padding: 0 4px;
  z-index: 5;
}
.ranch-toolbelt button {
  position: relative;
  display: flex;
  align-items: center;
  flex-direction: column;
  justify-content: end;
  gap: 0;
  min-width: 86px;
  min-height: 100px;
  border: 0;
  background: transparent;
  padding: 0;
  color: #fff4d9;
  cursor: pointer;
}
.tool-art {
  width: 76px;
  height: 76px;
  border: 2px solid #f2ce87;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #f2ce8e, #be8650);
  box-shadow:
    inset 0 0 0 4px #dfad72,
    0 4px 0 #7f5536a1;
  display: grid;
  place-items: center;
  transition: transform 0.15s;
}
.tool-art :deep(svg) {
  width: 74px;
  height: 74px;
  filter: drop-shadow(0 2px 1px #69402940);
}
.tool-name {
  margin-top: -3px;
  padding: 5px 9px;
  z-index: 1;
  white-space: nowrap;
  border: 1px solid #dcb580;
  border-radius: 9px;
  background: linear-gradient(#cb9865, #aa7147);
  box-shadow: 0 3px 0 #74472765;
  font-weight: 850;
  font-size: 13px;
  text-shadow: 0 1px #74482b;
}
.ranch-toolbelt button:hover:not(:disabled) .tool-art {
  transform: translateY(-3px);
}
.ranch-toolbelt button:disabled {
  filter: saturate(0.6);
  opacity: 0.7;
  cursor: default;
}
.tool-count {
  position: absolute;
  top: 1px;
  right: 4px;
  min-width: 21px;
  min-height: 21px;
  display: grid;
  place-items: center;
  padding: 0 4px;
  border: 2px solid #fff0b2;
  border-radius: 50%;
  background: #719a35;
  color: white;
  font-size: 11px;
  font-weight: 900;
}
.alert-count {
  background: #d57240;
}
.game-offline-note {
  position: absolute;
  left: 50%;
  bottom: 130px;
  transform: translateX(-50%);
  white-space: nowrap;
  border-radius: 20px;
  padding: 5px 13px;
  background: #fff2c8ba;
  color: #587239;
  font-size: 12px;
  pointer-events: none;
}
.game-error {
  position: absolute;
  top: 120px;
  left: 50%;
  transform: translateX(-50%);
  max-width: 90%;
  padding: 10px;
  border: 2px solid #d89475;
  background: #fff2dc;
  border-radius: 12px;
  z-index: 10;
}
.game-error button {
  min-height: 44px;
}
.ranch-loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 15px;
  background: #e5eed1;
}
.ranch-loading :deep(svg) {
  width: 70px;
  height: 70px;
}
.ranch-window {
  --ink: #6f4d31;
  --soft-ink: #8b7350;
  --paper: #fff5d9;
  --tile: #fff8e7;
  --edge: #dcc294;
  color: var(--ink);
  width: min(960px, calc(100% - 28px));
  max-height: 88dvh;
  padding: 0;
  overflow: hidden;
  border: 3px solid #eac291;
  border-radius: 24px;
  background: linear-gradient(120deg, #d09a6b, #b97b52);
  box-shadow:
    0 7px 0 #754b3166,
    0 22px 80px #17291366;
}
.ranch-window[open] {
  display: flex;
  flex-direction: column;
}
.ranch-window::backdrop {
  background: #112d3d8c;
  backdrop-filter: blur(3px);
}
.ranch-window-heading {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  gap: 12px;
  padding: 10px 66px;
  min-height: 76px;
  border-bottom: 2px solid #ae704a;
  background:
    repeating-linear-gradient(
      3deg,
      transparent 0 19px,
      #a3643720 20px 22px,
      transparent 24px 40px
    ),
    linear-gradient(#dba77b, #c3895f);
  box-shadow: inset 0 3px #ffe3ad45;
}
.ranch-window-heading h2 {
  margin: 0;
  font-size: 25px;
  font-weight: 900;
  letter-spacing: 2px;
  color: #fff3d9;
  text-shadow: 0 2px 0 #92623f;
}
.window-emblem {
  width: 52px;
  height: 48px;
}
.window-emblem :deep(svg) {
  width: 100%;
  height: 100%;
}
.window-close {
  position: absolute;
  right: 10px;
  top: 10px;
  width: 50px;
  height: 50px;
  padding: 0;
  border: 2px solid #ffe1b5;
  border-radius: 16px;
  background: linear-gradient(#e6b58d, #c8885f);
  box-shadow:
    inset 0 3px #f9d3b4,
    0 3px 0 #a26743;
  color: #fff4dc;
  font-size: 28px;
  font-weight: 900;
  cursor: pointer;
}
.ranch-window button {
  font-family: inherit;
  touch-action: manipulation;
}
.ranch-window button:focus-visible,
.immersive-ranch button:focus-visible {
  outline: 3px solid #53912b;
  outline-offset: 2px;
}
.ranch-window button:disabled {
  opacity: 0.55;
  filter: saturate(0.3);
  cursor: not-allowed;
}
.ranch-window input,
.ranch-window select {
  color: var(--ink);
  background: var(--paper);
  border: 2px solid var(--edge);
  border-radius: 12px;
  min-height: 44px;
  padding: 7px 12px;
  font-size: 14px;
  min-width: 0;
}
.ranch-window input::placeholder {
  color: var(--soft-ink);
}
.wood-tabs {
  display: flex;
  gap: 2px;
  border-bottom: 3px solid #996239;
  padding: 0 12px;
}
.wood-tabs button,
.wood-tabs > span:first-child {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 48px;
  padding: 8px 3px;
  color: #fff6db;
  font-size: 15px;
  font-weight: 850;
  border: 1px solid #d9a478;
  border-radius: 15px 15px 0 0;
  background: linear-gradient(#cf9567, #bd8052);
  text-shadow: 0 1px #945a38;
  box-shadow: inset 0 2px #ecbc8d85;
  cursor: pointer;
}
.wood-tabs button.active,
.wood-tabs > span.active {
  color: #7f4b26;
  background: linear-gradient(#ffe394, #f4b64c);
  border-color: #f4cb76;
  text-shadow: 0 1px #ffe9b9;
}
.ranch-shop-filters {
  flex-shrink: 0;
  padding-top: 10px;
}
.catalog-search {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 12px 16px 0;
}
.catalog-search > input {
  flex: 1;
  width: 60%;
}
.catalog-search label {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #fff4da;
  font-size: 13px;
  white-space: nowrap;
  min-height: 44px;
}
.catalog-search label input {
  width: 21px;
  height: 21px;
  min-height: 0;
  accent-color: #6e9d39;
}
.catalog-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 18px;
  color: #fff2d6;
  font-size: 12px;
}
.catalog-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 285px;
  min-height: 0;
  height: min(550px, calc(88dvh - 226px));
  padding: 0 14px 14px;
  gap: 12px;
}
.panel-scroll {
  overflow-y: auto;
  overscroll-behavior: contain;
  min-height: 0;
  scrollbar-width: thin;
  scrollbar-color: #b98b5b #f3e4bf;
  -webkit-overflow-scrolling: touch;
}
.ranch-shop-grid,
.ranch-inventory {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  align-content: start;
  gap: 8px;
  background: var(--paper);
  border: 2px solid var(--edge);
  border-radius: 15px;
  padding: 12px;
}
.item-tile {
  position: relative;
  display: flex;
  align-items: center;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  padding: 8px 6px 9px;
  border: 2px solid #e0cda7;
  border-radius: 11px;
  background: linear-gradient(var(--tile), var(--paper));
  box-shadow:
    inset 0 2px #fff9e6,
    0 3px 0 #bfa87c85;
  color: var(--ink);
  cursor: pointer;
}
.item-tile.selected {
  border-color: #73a52f;
  box-shadow:
    inset 0 0 0 2px #b8cf6d,
    0 3px 0 #9baa63;
}
.item-tile strong {
  max-width: 100%;
  font-size: 13px;
  line-height: 19px;
  overflow-wrap: anywhere;
}
.item-tile small {
  font-size: 10px;
  color: var(--soft-ink);
}
.tile-level {
  align-self: flex-start;
  font-size: 10px;
  line-height: 15px;
  font-weight: 800;
  color: var(--soft-ink);
}
.shop-fullbody,
.product-art {
  width: 100%;
  height: 94px;
  flex-shrink: 0;
  filter: drop-shadow(0 3px 1px #66802b20);
}
.tile-price {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 800;
  gap: 3px;
}
.tile-price :deep(svg) {
  width: 23px;
  height: 23px;
}
.tile-lock {
  position: absolute;
  inset: 0;
  border-radius: 8px;
  background: #665d41a3;
  color: #fff7d9;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  font-size: 12px;
  font-weight: 850;
  pointer-events: none;
  text-shadow: 0 2px #49442e;
}
.tile-lock > span {
  font-size: 35px;
  line-height: 44px;
}
.item-detail {
  display: flex;
  flex-direction: column;
  gap: 14px;
  background: var(--paper);
  border: 2px solid var(--edge);
  border-radius: 15px;
  padding: 16px;
  overflow-y: auto;
  min-height: 0;
  overscroll-behavior: contain;
}
.detail-overview {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}
.detail-title {
  width: 100%;
  text-align: center;
}
.detail-title h3 {
  font-size: 22px;
  margin: 4px 0 7px;
  color: var(--ink);
}
.detail-title p {
  margin: 4px 0;
  font-size: 13px;
}
.detail-kicker {
  font-size: 11px;
  color: var(--soft-ink);
}
.detail-art {
  width: 155px;
  height: 145px;
  padding: 13px;
  flex-shrink: 0;
}
.meadow-art {
  background: radial-gradient(ellipse at 50% 74%, #acc97686, transparent 68%);
  border-radius: 50%;
}
.stage-switch {
  display: inline-flex;
  border: 2px solid #d8bd8c;
  border-radius: 24px;
  background: #eedfbd;
  padding: 2px;
  max-width: 100%;
}
.stage-switch button {
  padding: 6px 16px;
  min-height: 36px;
  border: 0;
  border-radius: 20px;
  color: #85704e;
  background: transparent;
  font-weight: 800;
}
.stage-switch button.active {
  background: #a8bf51;
  color: #fffbe7;
  box-shadow: 0 2px 0 #829942;
}
.detail-copy p {
  font-size: 13px;
  line-height: 1.7;
  margin: 0 0 12px;
  color: var(--soft-ink);
}
.detail-facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  border-top: 1px solid var(--edge);
  padding-top: 12px;
}
.detail-facts span {
  font-size: 11px;
  color: var(--soft-ink);
}
.detail-facts strong {
  display: block;
  margin-top: 4px;
  font-size: 13px;
  color: var(--ink);
}
.detail-actions {
  margin-top: auto;
}
.detail-footnote {
  font-size: 12px;
  line-height: 1.7;
  margin: auto 0 0;
  color: var(--soft-ink);
}
.ranch-primary,
.ranch-secondary {
  border: 2px solid #c0d460;
  border-radius: 24px;
  min-height: 46px;
  padding: 9px 18px;
  color: #fffce6;
  background: linear-gradient(#b9d741, #80af16);
  box-shadow:
    inset 0 3px #dceb855c,
    0 3px 0 #618e20;
  font-size: 14px;
  font-weight: 900;
  cursor: pointer;
  text-shadow: 0 1px #6d941b;
}
.ranch-secondary {
  color: #815832;
  border-color: #d3ad73;
  background: linear-gradient(#ffe3a2, #edbd67);
  text-shadow: none;
  box-shadow:
    inset 0 3px #fff0c35c,
    0 3px 0 #b18a4e;
}
.item-detail .ranch-primary,
.item-detail .ranch-secondary {
  width: 100%;
}
.store-tabs {
  padding: 10px 15px 0;
  align-items: center;
  margin-bottom: 12px;
}
.store-tabs > span:first-child {
  flex: initial;
  min-width: 120px;
}
.store-tabs > span:last-child {
  margin-left: auto;
  color: #fff1d8;
  font-size: 12px;
  padding: 0 10px;
}
.store-window .catalog-layout {
  height: min(530px, calc(88dvh - 157px));
}
.product-count {
  color: #8a713f;
  font-weight: 800;
  font-size: 14px;
}
.ranch-sell-all {
  margin-top: auto;
  padding-top: 12px;
  border-top: 1px solid var(--edge);
}
.ranch-sell-all p {
  font-size: 12px;
  margin: 0 0 12px;
}
.ranch-sell-all strong {
  float: right;
  color: var(--ink);
}
.empty {
  grid-column: 1/-1;
  align-self: center;
  text-align: center;
  padding: 30px 12px;
  color: var(--soft-ink);
  font-size: 14px;
  line-height: 1.8;
}
.empty :deep(svg) {
  width: 95px;
  height: 95px;
  margin: 0 auto 15px;
  display: block;
}
.ranch-feed,
.ranch-animal-detail,
.ranch-neighbors,
.ranch-bottom,
.ranch-help {
  margin: 14px;
  padding: 20px;
  background: var(--paper);
  border: 2px solid var(--edge);
  border-radius: 16px;
  color: var(--ink);
}
.ranch-window:not(.catalog-window):not(.store-window) {
  width: min(640px, calc(100% - 28px));
}
.feed-hero {
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
}
.feed-hero :deep(svg) {
  width: 180px;
  height: 145px;
}
.feed-hero h3 {
  font-size: 32px;
  margin: 8px 0 14px;
}
.feed-hero h3 small {
  font-size: 15px;
  color: var(--soft-ink);
}
.tag {
  display: inline-block;
  padding: 4px 10px;
  background: #e4efbd;
  border: 1px solid #b7ca71;
  color: #64882e;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 800;
}
.tag.danger {
  background: #ffe3bd;
  color: #a65f33;
  border-color: #d7a172;
}
.ranch-feed p,
.ranch-animal-detail p,
.ranch-help p,
.ranch-bottom p {
  font-size: 13px;
  color: var(--soft-ink);
  line-height: 1.9;
}
.ranch-feed > small {
  font-size: 12px;
  line-height: 1.7;
  color: var(--soft-ink);
  display: block;
  margin-top: 18px;
}
.ranch-feed-buttons {
  display: flex;
  gap: 10px;
  margin-top: 14px;
}
.ranch-feed-buttons button {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  flex-direction: column;
  gap: 5px;
  padding: 10px 5px;
  border: 2px solid var(--edge);
  border-radius: 16px;
  background: var(--tile);
  color: var(--ink);
  box-shadow: 0 3px #ccb287;
  cursor: pointer;
}
.ranch-feed-buttons :deep(svg) {
  width: 70px;
  height: 70px;
}
.ranch-feed-buttons strong {
  font-size: 22px;
}
.ranch-feed-buttons small {
  font-size: 12px;
}
.animal-detail-stage {
  position: relative;
  display: flex;
  align-items: center;
  flex-direction: column;
  border-radius: 14px;
  padding: 16px;
  background: radial-gradient(ellipse at center, #d1e4a6, #f5eabd);
  overflow: hidden;
}
.ranch-detail-portrait {
  width: 230px;
  height: 210px;
  margin: 10px 0;
  filter: drop-shadow(0 4px 2px #83933955);
}
.animal-state {
  font-size: 17px;
  color: #587d2f;
}
.actions {
  display: flex;
  gap: 12px;
}
.actions button {
  flex: 1;
}
.neighbor-filters {
  display: flex;
  gap: 8px;
}
.neighbor-filters input {
  flex: 1;
  width: 60%;
}
.neighbor-filters select {
  max-width: 115px;
  font-size: 12px;
  padding: 5px;
}
.panel-hint {
  font-size: 12px;
  color: var(--soft-ink);
  line-height: 1.6;
}
.player-line {
  display: flex;
  align-items: center;
  gap: 13px;
  padding: 16px 12px;
  margin: 14px 0;
  border: 2px solid var(--edge);
  border-radius: 16px;
  background: var(--tile);
  box-shadow: 0 3px 0 #c4ad7e55;
}
.neighbor-avatar {
  position: relative;
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  border: 3px solid #ddb974;
  border-radius: 50%;
  background: linear-gradient(#d4e7a6, #b4ca78);
  color: #647b3c;
  font-size: 23px;
  font-weight: 900;
  flex-shrink: 0;
}
.neighbor-avatar > span {
  position: absolute;
  bottom: -8px;
  right: -10px;
  padding: 3px 5px;
  font-size: 9px;
  border-radius: 7px;
  background: #f6d178;
  color: #845a2f;
  border: 1px solid #d4a455;
  white-space: nowrap;
}
.details {
  display: flex;
  flex-direction: column;
  gap: 5px;
  flex: 1;
  min-width: 0;
}
.details strong {
  overflow-wrap: anywhere;
  font-size: 16px;
}
.details small {
  font-size: 11px;
  color: var(--soft-ink);
}
.player-line button {
  white-space: nowrap;
  flex-shrink: 0;
  padding: 8px 12px;
  font-size: 12px;
}
.ranch-expand {
  text-align: center;
  padding-bottom: 20px;
}
.ranch-expand :deep(svg) {
  width: 110px;
  height: 95px;
  margin: 0 auto;
}
.ranch-expand h3 {
  margin: 5px 0;
  font-size: 21px;
}
.journal-title {
  padding-top: 16px;
  border-top: 1px solid var(--edge);
  margin: 0 0 10px;
  font-size: 17px;
}
.ranch-log {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px dashed var(--edge);
  font-size: 13px;
  line-height: 1.7;
}
.ranch-log small {
  color: var(--soft-ink);
  white-space: nowrap;
}
.ranch-help h3 {
  font-size: 21px;
  color: var(--ink);
}
.panel-error {
  flex-shrink: 0;
  color: #7e2828;
  background: #fff0dc;
  padding: 8px;
  margin: 8px 16px;
  border-radius: 8px;
  font-size: 12px;
}
:global([data-theme="dark"] .ranch-window) {
  --ink: #eedcc0;
  --soft-ink: #cbb696;
  --paper: #463d2b;
  --tile: #514630;
  --edge: #7c6745;
  background: linear-gradient(#927050, #785b40);
  border-color: #b99c70;
}
:global([data-theme="dark"] .ranch-window-heading) {
  background: linear-gradient(#a47b54, #906442);
}
:global([data-theme="dark"] .item-tile) {
  border-color: #796744;
  background: linear-gradient(#574a34, #463d2b);
  box-shadow:
    inset 0 2px #665a41,
    0 3px 0 #2b281d;
}
:global([data-theme="dark"] .item-tile.selected) {
  border-color: #b1c65b;
  box-shadow: inset 0 0 0 2px #799240;
}
:global([data-theme="dark"] .wood-tabs button) {
  background: linear-gradient(#a47a50, #865c3d);
}
:global([data-theme="dark"] .wood-tabs button.active) {
  background: linear-gradient(#e7c472, #c99642);
  color: #543617;
}
:global([data-theme="dark"] .animal-detail-stage) {
  background: radial-gradient(ellipse, #5d7241, #4b432e);
}
:global([data-theme="dark"] .animal-state) {
  color: #c7de8a;
}
:global([data-theme="dark"] .game-profile) {
  background: linear-gradient(#997951, #755a3d);
  border-color: #be9e69;
}
@media (max-width: 700px) {
  .game-profile {
    left: 10px;
    top: max(10px, env(safe-area-inset-top));
    gap: 7px;
    padding: 6px 9px 6px 6px;
    max-width: calc(100% - 126px);
    border-radius: 32px 14px 14px 32px;
  }
  .ranch-avatar {
    width: 45px;
    height: 45px;
  }
  .ranch-avatar :deep(svg) {
    width: 40px;
    height: 40px;
  }
  .profile-text h1 {
    font-size: 13px;
  }
  .profile-level {
    font-size: 12px;
  }
  .profile-level small {
    font-size: 9px;
    margin-left: 3px;
  }
  .profile-text progress {
    min-width: 70px;
    height: 8px;
  }
  .game-wallet {
    right: 10px;
    top: max(12px, env(safe-area-inset-top));
    min-width: 103px;
    gap: 5px;
  }
  .wallet-coins {
    min-height: 29px;
    font-size: 14px;
    padding-right: 8px;
  }
  .wallet-coins :deep(svg),
  .wallet-feed :deep(svg) {
    height: 25px;
    width: 26px;
  }
  .wallet-feed {
    font-size: 11px;
    padding: 1px 6px 1px 2px;
    min-height: 44px;
  }
  .game-side-actions {
    left: 10px;
    top: 109px;
    gap: 10px;
  }
  .game-side-actions button {
    width: 44px;
    height: 49px;
  }
  .game-side-actions span {
    font-size: 24px;
    line-height: 23px;
  }
  .game-side-actions :deep(svg) {
    height: 27px;
    width: 30px;
  }
  .game-side-actions small {
    font-size: 9px;
  }
  .ranch-toolbelt {
    gap: 5px;
    bottom: max(14px, env(safe-area-inset-bottom));
    width: calc(100% - 12px);
    padding: 0;
  }
  .ranch-toolbelt button {
    min-width: 0;
    flex: 1;
    min-height: 78px;
  }
  .tool-art {
    width: 52px;
    height: 52px;
    border-width: 1px;
    box-shadow:
      inset 0 0 0 3px #dfad72,
      0 3px 0 #7f5536a1;
  }
  .tool-art :deep(svg) {
    width: 52px;
    height: 52px;
  }
  .tool-name {
    font-size: 10px;
    padding: 5px 3px;
    letter-spacing: -0.3px;
  }
  .tool-count {
    right: 0;
    top: 0;
    font-size: 9px;
    min-width: 18px;
    min-height: 18px;
  }
  .game-offline-note {
    bottom: 106px;
    font-size: 10px;
    padding: 4px 10px;
  }
  .ranch-window {
    width: calc(100% - 16px);
    border-width: 2px;
    border-radius: 22px;
    max-height: 89dvh;
  }
  .ranch-window:not(.catalog-window):not(.store-window) {
    width: calc(100% - 16px);
  }
  .ranch-window-heading {
    min-height: 62px;
    padding: 7px 55px;
    gap: 8px;
  }
  .ranch-window-heading h2 {
    font-size: 21px;
  }
  .window-emblem {
    width: 37px;
    height: 38px;
  }
  .window-close {
    width: 44px;
    height: 44px;
    right: 7px;
    top: 7px;
    font-size: 25px;
    border-radius: 13px;
  }
  .wood-tabs {
    padding: 0 9px;
  }
  .wood-tabs button {
    min-height: 44px;
    font-size: 13px;
    border-radius: 13px 13px 0 0;
  }
  .catalog-search {
    margin: 9px 11px 0;
    gap: 8px;
  }
  .catalog-search input {
    font-size: 12px;
  }
  .catalog-search label {
    font-size: 12px;
  }
  .catalog-summary {
    padding: 6px 13px;
    font-size: 10px;
  }
  .catalog-layout {
    display: flex;
    flex-direction: column;
    height: min(670px, calc(89dvh - 201px));
    padding: 0 9px 10px;
    gap: 9px;
  }
  .ranch-shop-grid,
  .ranch-inventory {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    flex: 1;
    min-height: 118px;
    padding: 8px;
    gap: 6px;
    border-radius: 12px;
  }
  .item-tile {
    padding: 5px 3px;
    gap: 3px;
    border-radius: 8px;
  }
  .item-tile strong {
    font-size: 11px;
    line-height: 16px;
  }
  .item-tile small {
    font-size: 9px;
  }
  .shop-fullbody,
  .product-art {
    height: 70px;
  }
  .tile-level {
    font-size: 9px;
    line-height: 12px;
  }
  .tile-price {
    font-size: 11px;
  }
  .tile-price :deep(svg) {
    width: 19px;
    height: 19px;
  }
  .tile-lock {
    font-size: 10px;
  }
  .tile-lock > span {
    font-size: 25px;
    line-height: 32px;
  }
  .item-detail {
    flex-shrink: 0;
    padding: 11px;
    gap: 8px;
    overflow: auto;
    max-height: 44%;
    border-radius: 13px;
  }
  .detail-overview {
    flex-direction: row;
    gap: 10px;
  }
  .detail-art {
    width: 84px;
    height: 80px;
    padding: 6px;
  }
  .detail-title {
    text-align: left;
    min-width: 0;
    flex: 1;
  }
  .detail-title h3 {
    font-size: 19px;
    margin: 2px 0 4px;
  }
  .detail-kicker {
    font-size: 10px;
  }
  .stage-switch button {
    font-size: 11px;
    min-height: 32px;
    padding: 5px 15px;
  }
  .detail-copy p {
    display: none;
  }
  .detail-facts {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 5px;
    padding-top: 7px;
  }
  .detail-facts span {
    font-size: 10px;
  }
  .detail-facts strong {
    font-size: 11px;
    margin-top: 3px;
  }
  .ranch-primary,
  .ranch-secondary {
    font-size: 13px;
    padding: 8px 10px;
    min-height: 44px;
  }
  .detail-actions {
    margin-top: 0;
  }
  .detail-footnote {
    font-size: 11px;
    margin: 0;
  }
  .store-window .catalog-layout {
    height: min(650px, calc(89dvh - 126px));
  }
  .store-tabs {
    padding: 8px 10px 0;
    margin-bottom: 9px;
  }
  .store-tabs > span:first-child {
    min-width: 105px;
    min-height: 44px;
    font-size: 14px;
  }
  .inventory-detail {
    max-height: 55%;
  }
  .inventory-detail .detail-art {
    width: 65px;
    height: 60px;
  }
  .inventory-detail .detail-facts {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .ranch-sell-all {
    padding-top: 8px;
    margin-top: 0;
  }
  .ranch-sell-all p {
    margin-bottom: 8px;
  }
  .product-count {
    font-size: 12px;
  }
  .ranch-feed,
  .ranch-animal-detail,
  .ranch-neighbors,
  .ranch-bottom,
  .ranch-help {
    margin: 9px;
    padding: 14px;
    border-radius: 13px;
  }
  .feed-hero :deep(svg) {
    height: 115px;
    width: 145px;
  }
  .feed-hero h3 {
    font-size: 28px;
  }
  .ranch-feed-buttons {
    gap: 7px;
  }
  .ranch-feed-buttons :deep(svg) {
    width: 58px;
    height: 58px;
  }
  .ranch-detail-portrait {
    width: 190px;
    height: 175px;
  }
  .player-line {
    gap: 10px;
    padding: 14px 9px;
  }
  .neighbor-avatar {
    width: 42px;
    height: 42px;
    font-size: 18px;
  }
  .details strong {
    font-size: 14px;
  }
  .player-line button {
    padding: 6px 9px;
    font-size: 11px;
  }
  .neighbor-filters select {
    max-width: 101px;
  }
}
@media (max-width: 350px) {
  .tool-art {
    width: 46px;
    height: 46px;
  }
  .tool-art :deep(svg) {
    width: 46px;
    height: 46px;
  }
  .tool-name {
    font-size: 9px;
    padding: 4px 2px;
  }
  .ranch-toolbelt {
    gap: 3px;
  }
  .shop-fullbody,
  .product-art {
    height: 61px;
  }
  .ranch-shop-grid,
  .ranch-inventory {
    gap: 4px;
    padding: 6px;
  }
  .tile-lock {
    font-size: 9px;
  }
  .item-tile strong {
    font-size: 10px;
  }
}
@media (max-height: 500px) and (min-width: 600px) {
  .game-profile {
    top: 8px;
    left: 10px;
    padding: 4px 10px 4px 4px;
  }
  .ranch-avatar {
    width: 40px;
    height: 40px;
  }
  .ranch-avatar :deep(svg) {
    width: 36px;
    height: 36px;
  }
  .profile-text h1 {
    font-size: 13px;
  }
  .profile-level {
    font-size: 12px;
  }
  .game-side-actions {
    left: 12px;
    top: 89px;
    gap: 8px;
  }
  .game-side-actions button {
    width: 44px;
    height: 44px;
  }
  .game-side-actions span {
    font-size: 22px;
    line-height: 20px;
  }
  .game-wallet {
    top: 8px;
    right: 12px;
  }
  .ranch-toolbelt {
    gap: 10px;
    bottom: 8px;
  }
  .ranch-toolbelt button {
    min-height: 68px;
    min-width: 62px;
  }
  .tool-art {
    width: 44px;
    height: 44px;
  }
  .tool-art :deep(svg) {
    width: 44px;
    height: 44px;
  }
  .tool-name {
    font-size: 10px;
    padding: 4px 6px;
  }
  .game-offline-note {
    bottom: 88px;
    font-size: 10px;
  }
  .ranch-window {
    max-height: 94dvh;
    width: min(790px, calc(100% - 36px));
  }
  .ranch-window-heading {
    min-height: 50px;
    padding: 4px 55px;
  }
  .ranch-window-heading h2 {
    font-size: 19px;
  }
  .window-close {
    width: 44px;
    height: 44px;
    top: 1px;
  }
  .window-emblem {
    height: 35px;
    width: 38px;
  }
  .ranch-shop-filters {
    padding-top: 5px;
  }
  .wood-tabs button {
    min-height: 44px;
    padding: 5px;
  }
  .catalog-search {
    margin-top: 6px;
  }
  .catalog-summary {
    padding: 4px 17px;
  }
  .catalog-layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 255px;
    height: calc(94dvh - 188px);
    padding: 0 10px 10px;
    gap: 8px;
  }
  .ranch-shop-grid,
  .ranch-inventory {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    padding: 8px;
    gap: 6px;
  }
  .shop-fullbody,
  .product-art {
    height: 65px;
  }
  .item-detail {
    padding: 10px;
    gap: 8px;
  }
  .detail-overview {
    flex-direction: row;
    gap: 8px;
  }
  .detail-art {
    width: 72px;
    height: 70px;
    padding: 5px;
  }
  .detail-title {
    text-align: left;
  }
  .detail-title h3 {
    font-size: 18px;
  }
  .detail-copy p {
    display: none;
  }
  .detail-facts {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 4px;
    padding-top: 7px;
  }
  .detail-facts strong {
    font-size: 11px;
  }
  .detail-actions {
    margin-top: 0;
  }
  .store-window .catalog-layout {
    height: calc(94dvh - 118px);
  }
  .ranch-feed,
  .ranch-animal-detail,
  .ranch-neighbors,
  .ranch-bottom,
  .ranch-help {
    margin: 8px;
  }
}
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    transition: none !important;
    animation: none !important;
  }
}

/* Keep scene utilities away from the painted trough and the animal picker. */
.game-side-actions .album-menu {
  position: fixed;
  right: 20px;
  top: 124px;
}
.ranch-window .item-tile {
  margin: 0;
  letter-spacing: normal;
}
.ranch-window .item-tile:hover:not(:disabled) {
  background: var(--tile);
}
.ranch-window .ranch-primary:hover:not(:disabled) {
  background: linear-gradient(#c2dd54, #8fb924);
}
.ranch-window .ranch-secondary:hover:not(:disabled) {
  background: linear-gradient(#ffeab5, #f0c777);
}
.immersive-ranch .wallet-feed:hover {
  background: linear-gradient(#fff7dd, #f7e9bd);
}
.immersive-ranch .ranch-toolbelt button:hover {
  background: transparent;
}
.ranch-window .stage-switch button:hover:not(:disabled) {
  background: #ded1ad;
}
.ranch-window .stage-switch button.active:hover {
  background: #a8bf51;
}
.ranch-window .window-close:hover {
  background: linear-gradient(#edbd96, #d29669);
}
:global([data-theme="light"] dialog.ranch-window) {
  border-color: #eac291;
  box-shadow:
    0 7px 0 #754b3166,
    0 22px 80px #17291366;
}
:global([data-theme="light"] dialog.ranch-window::backdrop) {
  background: #112d3d8c;
}
@media (max-width: 700px) {
  .game-side-actions .album-menu {
    right: 10px;
    top: 109px;
  }
}
@media (max-height: 500px) and (min-width: 600px) {
  .game-side-actions {
    display: flex;
    flex-direction: row;
    top: 84px;
  }
  .game-side-actions .album-menu {
    position: static;
  }
}

.ranch-shop-animal {
  min-height: 176px;
}
.ranch-product {
  min-height: 150px;
}
.ranch-window .stage-switch button {
  min-height: 44px;
}
@media (max-width: 700px) {
  .ranch-shop-animal {
    min-height: 124px;
  }
  .ranch-product {
    min-height: 120px;
  }
  .catalog-detail {
    max-height: none;
    overflow: visible;
  }
  .catalog-detail .detail-art {
    width: 76px;
    height: 74px;
  }
  .catalog-detail .detail-title h3 {
    font-size: 18px;
  }
  .catalog-detail .stage-switch button {
    padding: 4px 14px;
    min-height: 44px;
  }
}
@media (max-width: 350px) {
  .catalog-detail {
    padding: 9px;
    gap: 6px;
  }
  .catalog-detail .detail-art {
    width: 68px;
    height: 66px;
  }
  .catalog-detail .detail-title h3 {
    font-size: 17px;
  }
  .catalog-detail .detail-facts {
    padding-top: 5px;
  }
}
@media (max-height: 500px) and (min-width: 600px) {
  .catalog-summary {
    display: none;
  }
  .catalog-layout {
    height: calc(94dvh - 166px);
  }
  .ranch-shop-animal {
    min-height: 145px;
  }
  .catalog-detail {
    padding: 8px;
    gap: 5px;
    overflow: visible;
  }
  .catalog-detail .detail-art {
    width: 58px;
    height: 58px;
  }
  .catalog-detail .detail-kicker {
    display: none;
  }
  .catalog-detail .detail-title h3 {
    font-size: 16px;
    line-height: 20px;
    margin: 0;
  }
  .catalog-detail .stage-switch button {
    padding: 2px 12px;
    min-height: 44px;
  }
  .catalog-detail .detail-facts {
    padding-top: 4px;
  }
  .catalog-detail .detail-facts span {
    font-size: 9px;
    line-height: 12px;
  }
  .catalog-detail .detail-facts strong {
    font-size: 10px;
    line-height: 14px;
    margin-top: 2px;
  }
  .catalog-detail .ranch-primary {
    min-height: 44px;
    padding: 7px;
  }
}

/* Quiet, flat level badge; no platform-dependent emoji padlock. */
.ranch-window .tile-lock {
  background: #68604466;
  color: #fff9e6;
  gap: 4px;
  font-size: 11px;
  text-shadow: 0 1px #635a4166;
}
.ranch-window .flat-lock {
  display: block;
  width: 15px;
  height: 18px;
  flex-shrink: 0;
}
@media (max-width: 700px) {
  .ranch-window .tile-lock {
    font-size: 10px;
    gap: 3px;
  }
}
@media (max-width: 350px) {
  .ranch-window .tile-lock {
    font-size: 9px;
  }
}
</style>
