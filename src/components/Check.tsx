"use client";
import { Checkbox } from "@heroui/react";

/** Casilla de selección de filas (slot="selection" de la tabla). */
export function Check(props: { slot?: "selection"; "aria-label": string }) {
  return (
    <Checkbox slot="selection" aria-label={props["aria-label"]} variant="secondary">
      <Checkbox.Content>
        <Checkbox.Control>
          <Checkbox.Indicator />
        </Checkbox.Control>
      </Checkbox.Content>
    </Checkbox>
  );
}
