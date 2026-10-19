; Installation : Phosphore s'inscrit comme navigateur possible (comme Chrome/Firefox), pour apparaître dans
; « Applications par défaut » de Windows. Le choix du navigateur par défaut reste fait par l'utilisateur dans Windows.
!macro customInstall
  StrCpy $0 "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
  StrCpy $1 "Software\Clients\StartMenuInternet\Phosphore"
  WriteRegStr HKCU "Software\Classes\PhosphoreURL" "" "Phosphore URL"
  WriteRegStr HKCU "Software\Classes\PhosphoreURL\DefaultIcon" "" '"$0",0'
  WriteRegStr HKCU "Software\Classes\PhosphoreURL\Application" "ApplicationName" "Phosphore"
  WriteRegStr HKCU "Software\Classes\PhosphoreURL\Application" "ApplicationIcon" '"$0",0'
  WriteRegStr HKCU "Software\Classes\PhosphoreURL\shell\open\command" "" '"$0" "%1"'
  WriteRegStr HKCU "$1" "" "Phosphore"
  WriteRegStr HKCU "$1\DefaultIcon" "" '"$0",0'
  WriteRegStr HKCU "$1\shell\open\command" "" '"$0"'
  WriteRegStr HKCU "$1\Capabilities" "ApplicationName" "Phosphore"
  WriteRegStr HKCU "$1\Capabilities" "ApplicationDescription" "Navigateur Phosphore"
  WriteRegStr HKCU "$1\Capabilities" "ApplicationIcon" '"$0",0'
  WriteRegStr HKCU "$1\Capabilities\StartMenu" "StartMenuInternet" "Phosphore"
  WriteRegStr HKCU "$1\Capabilities\URLAssociations" "http" "PhosphoreURL"
  WriteRegStr HKCU "$1\Capabilities\URLAssociations" "https" "PhosphoreURL"
  WriteRegStr HKCU "$1\Capabilities\FileAssociations" ".htm" "PhosphoreURL"
  WriteRegStr HKCU "$1\Capabilities\FileAssociations" ".html" "PhosphoreURL"
  WriteRegStr HKCU "Software\RegisteredApplications" "Phosphore" "$1\Capabilities"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

; Désinstallation : retire ces clés, sauf pendant une mise à jour (l'installateur lance d'abord l'ancien désinstalleur).
!macro customUnInstall
  ${ifNot} ${isUpdated}
    DeleteRegKey HKCU "Software\Classes\PhosphoreURL"
    DeleteRegKey HKCU "Software\Clients\StartMenuInternet\Phosphore"
    DeleteRegValue HKCU "Software\RegisteredApplications" "Phosphore"
  ${endIf}
!macroend
