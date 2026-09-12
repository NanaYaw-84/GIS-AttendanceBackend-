import Image from "next/image";
import styles from "./page.module.css";

export default function Home() {
  return (
    <div className={styles.page}>
      {/* Fullscreen background image */}
      <div className={styles.bgImage}>
        <Image
          src="/bg-image.png"
          alt="Background"
          fill
          style={{ objectFit: "cover" }}
          priority
        />
      </div>

      <main className={styles.main}>
        <h1>WELCOME TO MY WORLD</h1>
      </main>
    </div>
  );
}
