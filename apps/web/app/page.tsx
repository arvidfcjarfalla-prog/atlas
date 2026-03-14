import dynamic from "next/dynamic";

const Landing = dynamic(() => import("./landing"), { ssr: false });

export default function Page() {
  return <Landing />;
}
