{pkgs}: {
  deps = [
    pkgs.alsa-lib
    pkgs.systemd
    pkgs.pango
    pkgs.cairo
    pkgs.mesa
    pkgs.xorg.libXrandr
    pkgs.xorg.libXfixes
    pkgs.xorg.libXext
    pkgs.xorg.libXdamage
    pkgs.xorg.libXcomposite
    pkgs.xorg.libX11
    pkgs.at-spi2-core
    pkgs.libxkbcommon
    pkgs.xorg.libxcb
    pkgs.expat
    pkgs.cups
    pkgs.at-spi2-atk
    pkgs.atk
    pkgs.dbus
    pkgs.nss
    pkgs.nspr
    pkgs.glib
    pkgs.poppler_utils
  ];
}
