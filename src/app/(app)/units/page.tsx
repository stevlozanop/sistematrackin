import { redirect } from "next/navigation";

/** /units ahora tiene dos módulos: PCL y YUR. */
export default function UnitsIndex() {
  redirect("/units/pcl");
}
