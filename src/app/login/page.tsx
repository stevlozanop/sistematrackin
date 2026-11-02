import { LoginForm } from "@/components/LoginForm";
import { PortFigure } from "@/components/figures/port/figure";

/** Login principal: Consorcio Leyva, sus supervisores y encargados, y The Iceberg Labs. */
export default function Login() {
  return (
    <LoginForm figure={
      <PortFigure caption={<><small>CALLAO · PUCALLPA · IQUITOS · YURIMAGUAS</small>Cada caja, de puerto a dealer.</>} />
    } />
  );
}
