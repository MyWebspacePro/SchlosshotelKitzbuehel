import type { Metadata } from "next";
import "./style.css";

export const metadata: Metadata = {
  title: "Schlosshotel Kitzbühel · Digital Operations",
  description: "Arbeitsplattform für Online-Marketing, Direktvertrieb und digitale Prozesse."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="de"><body>{children}</body></html>;
}
