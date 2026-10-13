$ErrorActionPreference = 'Stop'
$scripts = Get-ChildItem 'C:\Users\naiti\Desktop\MINIMAX\MiniMax_Projects\deplox\scripts\*.ps1' | Sort-Object Name
$tokens = $null
$errors = $null
foreach ($s in $scripts) {
    $ast = [System.Management.Automation.Language.Parser]::ParseFile($s.FullName, [ref]$tokens, [ref]$errors)
    if ($errors -and $errors.Count -gt 0) {
        Write-Host "  $($s.Name) : FAIL"
        foreach ($e in $errors) {
            Write-Host "    line $($e.Extent.StartLineNumber): $($e.Message.Split([Environment]::NewLine)[0])"
        }
    } else {
        Write-Host "  $($s.Name) : OK"
    }
    $errors = $null
}
