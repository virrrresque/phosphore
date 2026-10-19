; Désinstallation : retire les clés de registre « navigateur par défaut » écrites par la commande default-browser.
!macro customUnInstall
  DeleteRegKey HKCU "Software\Classes\PhosphoreURL"
  DeleteRegKey HKCU "Software\Clients\StartMenuInternet\Phosphore"
  DeleteRegValue HKCU "Software\RegisteredApplications" "Phosphore"
!macroend
