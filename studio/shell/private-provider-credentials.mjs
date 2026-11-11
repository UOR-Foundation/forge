// FoundrySpecification.privateProviderCredentialBoundary: credentials belong to device settings.
const fail=code=>Object.assign(new Error(code==='unsupportedCredentialProvider'?'Unsupported credential provider':'The stored provider credential is invalid'),{code});
export function deviceProviderCredential(settings,provider){
 if(!['openrouter','featherless'].includes(provider))throw fail('unsupportedCredentialProvider');
 let value;try{value=settings?.providerSettings?.[provider]?.apiKey?.value;}catch{throw fail('invalidStoredProviderCredential');}
 if(value===undefined||value===null||value==='')return '';
 if(typeof value!=='string'||value.length>8192||!/^[\x21-\x7e]+$/.test(value))throw fail('invalidStoredProviderCredential');
 return value;
}
