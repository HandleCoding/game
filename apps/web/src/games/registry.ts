import { defineAsyncComponent } from "vue";
export const gameViews: Record<
  string,
  ReturnType<typeof defineAsyncComponent>
> = {
  "guess-number": defineAsyncComponent(
    () => import("./guess-number/GuessNumber.vue"),
  ),
};
