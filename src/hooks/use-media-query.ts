import { useEffect, useState } from "react";

/** Vrai quand la media query correspond (false au rendu serveur et au premier rendu). */
export function useMediaQuery(query: string) {
  const [correspond, setCorrespond] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setCorrespond(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return correspond;
}
