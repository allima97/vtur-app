import React, { useState } from "react";
import { logoutUsuario } from "../../lib/logout";
import AppButton from "../ui/primer/AppButton";

export default function LogoutButtonIsland() {
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);
    await logoutUsuario();
    setLoading(false);
  }

  return (
    <AppButton
      type="button"
      variant="danger"
      className="menu-logout"
      onClick={handleLogout}
      style={{
        width: "100%",
        textAlign: "left",
      }}
      disabled={loading}
    >
      {loading ? "Saindo..." : "Sair"}
    </AppButton>
  );
}
