import { parserError } from "../../parser-error";
import { defArray, defObject, defText, defInteger } from "../metadata/layout";
import { defQuantity } from "../metadata/padstack";
import { argument, DefStatementReader } from "../metadata/text";
import type { HfssSceneContext } from "./context";

export async function readHfssComponents(context: HfssSceneContext) {
  const { source, components, pause } = context;
  for (const value of defArray(source.layout.fields[6])) {
    const pending = pause();
    if (pending) await pending;
    const component = defObject(value, 22),
      group = defObject(component.fields[0], 21),
      base = defObject(group.fields[0], 10);
    const transform = new DefStatementReader(defText(group.fields[2])).read()
      .value;
    if (typeof transform !== "object" || transform.name !== "f")
      throw parserError("hfssInvalidTransform");
    if (
      defQuantity(argument(transform, "x"), "length") !== 0 ||
      defQuantity(argument(transform, "y"), "length") !== 0 ||
      defQuantity(argument(transform, "r"), "angle") !== 0 ||
      Number(argument(transform, "s")) !== 1 ||
      argument(transform, "m") !== false
    )
      throw parserError("hfssUnsupportedTransform");
    components.set(
      defInteger(defObject(base.fields[0], 5).fields[0]),
      defText(group.fields[1]),
    );
  }
}
