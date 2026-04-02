export const LIGHT_COUNT = 16;

export type LightItem = {
  id: number;
  label: string;
};

export type LightStateMap = Record<number, boolean>;

export function createLightItems() {
  return Array.from({ length: LIGHT_COUNT }, (_, index) => {
    const id = index;
    return {
      id,
      label: `Luz ${id + 1}`,
    } satisfies LightItem;
  });
}

export function createInitialLightStates() {
  return createLightItems().reduce<LightStateMap>((acc, light) => {
    acc[light.id] = false;
    return acc;
  }, {});
}
