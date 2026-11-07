using System;
using System.Collections.Generic;
using System.Security.Cryptography.X509Certificates;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Win32;

internal static class CertificatePolicy {
 internal const string RegistryPath = @"Software\Policies\Google\Chrome\AutoSelectCertificateForUrls";
 internal const string PortalOrigin = "https://certificado.nfse.gov.br";
 internal static bool Configure(IWin32Window owner) {
  using (Registry.CurrentUser.CreateSubKey(RegistryPath)) {}
  using (var store = new X509Store(StoreName.My, StoreLocation.CurrentUser)) {
   store.Open(OpenFlags.ReadOnly);
   var eligible = new X509Certificate2Collection();
   foreach (var certificate in store.Certificates) {
    if (certificate.HasPrivateKey && certificate.NotBefore <= DateTime.Now &&
        certificate.NotAfter > DateTime.Now) eligible.Add(certificate);
   }
   var selected = X509Certificate2UI.SelectFromCollection(eligible,
    "Certificado para a NFS-e",
    "Escolha o certificado da empresa para acesso automático ao portal.",
    X509SelectionFlag.SingleSelection);
   if (selected.Count != 1) return false;
   var certificateToUse = selected[0];
   string subject = certificateToUse.GetNameInfo(X509NameType.SimpleName, false);
   string issuer = certificateToUse.GetNameInfo(X509NameType.SimpleName, true);
   if (String.IsNullOrWhiteSpace(subject) || String.IsNullOrWhiteSpace(issuer))
    throw new InvalidOperationException("O certificado precisa ter identificação de titular e emissor.");
   int matches = 0;
   foreach (var certificate in eligible)
    if (certificate.GetNameInfo(X509NameType.SimpleName, false) == subject &&
        certificate.GetNameInfo(X509NameType.SimpleName, true) == issuer) matches++;
   if (matches != 1)
    throw new InvalidOperationException("Há certificados válidos com o mesmo titular e emissor. O Chrome poderá pedir que você escolha um deles.");
   var serializer = new JavaScriptSerializer();
   var rule = serializer.Serialize(new {
    pattern = PortalOrigin,
    filter = new { SUBJECT = new { CN = subject }, ISSUER = new { CN = issuer } }
   });
   using (var key = Registry.CurrentUser.CreateSubKey(RegistryPath)) {
    foreach (var name in key.GetValueNames()) {
     if (name == "17846") continue;
     var existing = Convert.ToString(key.GetValue(name));
     if (existing.Contains("certificado.nfse.gov.br"))
      throw new InvalidOperationException("Já existe uma política de certificado para a NFS-e neste Chrome. Confira chrome://policy antes de alterar.");
    }
    key.SetValue("17846", rule, RegistryValueKind.String);
   }
   MessageBox.Show(owner,
    "Certificado configurado para certificado.nfse.gov.br. Recarregue as políticas em chrome://policy ou reinicie o Chrome. O navegador usará o certificado escolhido durante o acesso.",
    "Certificado configurado", MessageBoxButtons.OK, MessageBoxIcon.Information);
   return true;
  }
 }
}
