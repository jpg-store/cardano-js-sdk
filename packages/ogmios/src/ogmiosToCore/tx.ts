/* eslint-disable max-len */
import {
  BYRON_TX_FEE_COEFFICIENT,
  BYRON_TX_FEE_CONSTANT,
  isAlonzoOrAbove,
  isExpiresAt,
  isMaryOrAbove,
  isNativeScript,
  isPlutusV1Script,
  isPlutusV2Script,
  isRequireAllOf,
  isRequireAnyOf,
  isRequireNOf,
  isShelleyTx,
  isStartsAt
} from './util';
import { BlockKind, CommonBlock } from './types';
import {
  Cardano,
  NotImplementedError,
  ProviderUtil,
  SerializationError,
  SerializationFailure,
  addressNetworkId,
  createRewardAccount
} from '@cardano-sdk/core';
import { Schema } from '@cardano-ogmios/client';
import Fraction from 'fraction.js';
import omit from 'lodash/omit';

const mapMargin = (margin: string): Cardano.Fraction => {
  const { n: numerator, d: denominator } = new Fraction(margin);
  return { denominator, numerator };
};

const mapRelay = (relay: Schema.Relay): Cardano.Relay => {
  const port = relay.port || undefined;
  if ('hostname' in relay)
    return {
      // TODO: enum for typename
      __typename: 'RelayByName',
      hostname: relay.hostname,
      port
    };
  return {
    __typename: 'RelayByAddress',
    ipv4: relay.ipv4 || undefined,
    ipv6: relay.ipv6 || undefined,
    port
  };
};

const mapPoolParameters = (poolParameters: Schema.PoolParameters): Cardano.PoolParameters => {
  const rewardAccount = Cardano.RewardAccount(poolParameters.rewardAccount);
  return {
    ...omit(poolParameters, 'metadata'),
    // TODO: consider just casting without validation for better performance
    id: Cardano.PoolId(poolParameters.id),
    margin: mapMargin(poolParameters.margin),
    metadataJson: poolParameters.metadata
      ? {
          hash: Cardano.util.Hash32ByteBase16(poolParameters.metadata.hash),
          url: poolParameters.metadata.url
        }
      : undefined,
    owners: poolParameters.owners.map((ownerKeyHash) =>
      createRewardAccount(Cardano.Ed25519KeyHash(ownerKeyHash), addressNetworkId(rewardAccount))
    ),
    relays: poolParameters.relays.map(mapRelay),
    rewardAccount,
    vrf: Cardano.VrfVkHex(poolParameters.vrf)
  };
};

const mapCertificate = (certificate: Schema.Certificate): Cardano.Certificate => {
  if ('stakeDelegation' in certificate) {
    return {
      __typename: Cardano.CertificateType.StakeDelegation,
      poolId: Cardano.PoolId(certificate.stakeDelegation.delegatee),
      stakeKeyHash: Cardano.Ed25519KeyHash(certificate.stakeDelegation.delegator)
    };
  }
  if ('stakeKeyRegistration' in certificate) {
    return {
      __typename: Cardano.CertificateType.StakeKeyRegistration,
      stakeKeyHash: Cardano.Ed25519KeyHash(certificate.stakeKeyRegistration)
    };
  }
  if ('stakeKeyDeregistration' in certificate) {
    return {
      __typename: Cardano.CertificateType.StakeKeyDeregistration,
      stakeKeyHash: Cardano.Ed25519KeyHash(certificate.stakeKeyDeregistration)
    };
  }
  if ('poolRegistration' in certificate) {
    return {
      __typename: Cardano.CertificateType.PoolRegistration,
      poolParameters: mapPoolParameters(certificate.poolRegistration)
    } as Cardano.PoolRegistrationCertificate;
  }
  if ('poolRetirement' in certificate) {
    return {
      __typename: Cardano.CertificateType.PoolRetirement,
      epoch: Cardano.EpochNo(certificate.poolRetirement.retirementEpoch),
      poolId: Cardano.PoolId(certificate.poolRetirement.poolId)
    };
  }
  if ('genesisDelegation' in certificate) {
    return {
      __typename: Cardano.CertificateType.GenesisKeyDelegation,
      genesisDelegateHash: Cardano.util.Hash28ByteBase16(certificate.genesisDelegation.delegateKeyHash),
      genesisHash: Cardano.util.Hash28ByteBase16(certificate.genesisDelegation.verificationKeyHash),
      vrfKeyHash: Cardano.util.Hash32ByteBase16(certificate.genesisDelegation.vrfVerificationKeyHash)
    };
  }
  if ('moveInstantaneousRewards' in certificate) {
    return {
      __typename: Cardano.CertificateType.MIR,
      pot:
        certificate.moveInstantaneousRewards.pot === 'reserves'
          ? Cardano.MirCertificatePot.Reserves
          : Cardano.MirCertificatePot.Treasury,
      quantity: certificate.moveInstantaneousRewards.value || 0n
      // TODO: update MIR certificate type to support 'rewards' (multiple reward acc map to coins)
      // This is currently not compatible with core type (missing 'rewardAccount' which doesnt exist in ogmios)
      // rewardAccount: certificate.moveInstantaneousRewards.rewards.
      // Add test for it too.
    } as Cardano.MirCertificate;
  }
  throw new NotImplementedError('Unknown certificate mapping');
};

export const nativeScript = (script: Schema.ScriptNative): Cardano.NativeScript => {
  let coreScript: Cardano.NativeScript;

  if (typeof script === 'string') {
    coreScript = {
      __type: Cardano.ScriptType.Native,
      keyHash: Cardano.Ed25519KeyHash(script),
      kind: Cardano.NativeScriptKind.RequireSignature
    };
  } else if (isRequireAllOf(script)) {
    coreScript = {
      __type: Cardano.ScriptType.Native,
      kind: Cardano.NativeScriptKind.RequireAllOf,
      scripts: new Array<Cardano.NativeScript>()
    };
    for (let i = 0; i < script.all.length; ++i) {
      coreScript.scripts.push(nativeScript(script.all[i]));
    }
  } else if (isRequireAnyOf(script)) {
    coreScript = {
      __type: Cardano.ScriptType.Native,
      kind: Cardano.NativeScriptKind.RequireAnyOf,
      scripts: new Array<Cardano.NativeScript>()
    };
    for (let i = 0; i < script.any.length; ++i) {
      coreScript.scripts.push(nativeScript(script.any[i]));
    }
  } else if (isRequireNOf(script)) {
    const required = Number.parseInt(Object.keys(script)[0]);
    coreScript = {
      __type: Cardano.ScriptType.Native,
      kind: Cardano.NativeScriptKind.RequireNOf,
      required,
      scripts: new Array<Cardano.NativeScript>()
    };

    for (let i = 0; i < script[required].length; ++i) {
      coreScript.scripts.push(nativeScript(script[required][i]));
    }
  } else if (isExpiresAt(script)) {
    coreScript = {
      __type: Cardano.ScriptType.Native,
      kind: Cardano.NativeScriptKind.RequireTimeBefore,
      slot: Cardano.Slot(script.expiresAt)
    };
  } else if (isStartsAt(script)) {
    coreScript = {
      __type: Cardano.ScriptType.Native,
      kind: Cardano.NativeScriptKind.RequireTimeAfter,
      slot: Cardano.Slot(script.startsAt)
    };
  } else {
    throw new SerializationError(
      SerializationFailure.InvalidNativeScriptKind,
      `Native Script value '${script}' is not supported.`
    );
  }

  return coreScript;
};

const mapPlutusScript = (script: Schema.PlutusV1 | Schema.PlutusV2): Cardano.PlutusScript => {
  const version = isPlutusV1Script(script) ? Cardano.PlutusLanguageVersion.V1 : Cardano.PlutusLanguageVersion.V2;
  const plutusScript = isPlutusV1Script(script) ? script['plutus:v1'] : script['plutus:v2'];
  return {
    __type: Cardano.ScriptType.Plutus,
    bytes: Cardano.util.HexBlob(plutusScript),
    version
  };
};

export const mapScript = (script: Schema.Script): Cardano.Script => {
  if (isNativeScript(script)) {
    return nativeScript(script.native);
  } else if (isPlutusV1Script(script) || isPlutusV2Script(script)) return mapPlutusScript(script);

  throw new SerializationError(SerializationFailure.InvalidScriptType, `Script '${script}' is not supported.`);
};

const mapBootstrapWitness = (b: Schema.BootstrapWitness): Cardano.BootstrapWitness => ({
  // Based on the Ogmios maintainer answer  https://github.com/CardanoSolutions/ogmios/discussions/285#discussioncomment-4271726
  addressAttributes: b.addressAttributes ? Cardano.util.Base64Blob(b.addressAttributes) : undefined,
  chainCode: b.chainCode ? Cardano.util.HexBlob(b.chainCode) : undefined,
  key: Cardano.Ed25519PublicKey(b.key!),
  signature: Cardano.Ed25519Signature(Cardano.util.HexBlob.fromBase64(b.signature!).toString())
});

const mapRedeemer = (key: string, redeemer: Schema.Redeemer): Cardano.Redeemer => {
  const purposeAndIndex = key.split(':');

  return {
    data: Cardano.util.HexBlob(redeemer.redeemer),
    executionUnits: redeemer.executionUnits,
    index: Number(purposeAndIndex[1]),
    purpose: purposeAndIndex[0] as Cardano.RedeemerPurpose
  };
};

const mapAuxiliaryData = (data: Schema.AuxiliaryData | null): Cardano.AuxiliaryData | undefined => {
  if (data === null) return undefined;

  return {
    body: {
      blob: data.body.blob
        ? new Map(
            Object.entries(data.body.blob).map(([key, value]) => [BigInt(key), ProviderUtil.jsonToMetadatum(value)])
          )
        : undefined,
      scripts: data.body.scripts ? data.body.scripts.map(mapScript) : undefined
    },
    hash: Cardano.util.Hash32ByteBase16(data.hash)
  };
};

const mapTxIn = (txIn: Schema.TxIn): Cardano.TxIn => ({
  index: txIn.index,
  txId: Cardano.TransactionId(txIn.txId)
});

const mapDatum = (datum: Schema.TxOut['datum']) => {
  if (!datum) return;
  if (typeof datum === 'string') return Cardano.util.Hash32ByteBase16(datum);
  if (typeof datum === 'object') return Cardano.util.Hash32ByteBase16(JSON.stringify(datum));
};

const mapTxOut = (txOut: Schema.TxOut): Cardano.TxOut => ({
  address: Cardano.Address(txOut.address),
  datum: mapDatum(txOut.datum),
  value: {
    assets: txOut.value.assets
      ? new Map(Object.entries(txOut.value.assets).map(([key, value]) => [Cardano.AssetId(key), value]))
      : undefined,
    coins: txOut.value.coins
  }
});

const mapMint = (tx: Schema.TxMary): Cardano.TokenMap | undefined => {
  if (tx.body.mint.assets === undefined) return undefined;
  return new Map(Object.entries(tx.body.mint.assets).map(([key, value]) => [Cardano.AssetId(key), value]));
};

const mapScriptIntegrityHash = ({
  body: { scriptIntegrityHash }
}: Schema.TxAlonzo): Cardano.util.Hash32ByteBase16 | undefined => {
  if (scriptIntegrityHash === null) return undefined;
  return Cardano.util.Hash32ByteBase16(scriptIntegrityHash);
};

const mapValidityInterval = ({
  invalidBefore,
  invalidHereafter
}: Schema.ValidityInterval): Cardano.ValidityInterval => ({
  invalidBefore: invalidBefore ? Cardano.Slot(invalidBefore) : undefined,
  invalidHereafter: invalidHereafter ? Cardano.Slot(invalidHereafter) : undefined
});

const mapCommonTx = (tx: CommonBlock['body'][0], kind: BlockKind): Cardano.Tx => ({
  auxiliaryData: mapAuxiliaryData(tx.metadata),
  body: {
    certificates: tx.body.certificates.map(mapCertificate),
    collaterals: isAlonzoOrAbove(kind) ? (tx as Schema.TxAlonzo).body.collaterals.map(mapTxIn) : undefined,
    fee: tx.body.fee,
    inputs: tx.body.inputs.map(mapTxIn),
    mint: isMaryOrAbove(kind) ? mapMint(tx as Schema.TxMary) : undefined,
    outputs: tx.body.outputs.map(mapTxOut),
    requiredExtraSignatures: isAlonzoOrAbove(kind)
      ? (tx as Schema.TxAlonzo).body.requiredExtraSignatures.map(Cardano.Ed25519KeyHash)
      : undefined,
    scriptIntegrityHash: isAlonzoOrAbove(kind) ? mapScriptIntegrityHash(tx as Schema.TxAlonzo) : undefined,
    validityInterval: isShelleyTx(kind)
      ? undefined
      : mapValidityInterval((tx as Schema.TxAlonzo).body.validityInterval),
    withdrawals: Object.entries(tx.body.withdrawals).map(([key, value]) => ({
      quantity: value,
      stakeAddress: Cardano.RewardAccount(key)
    }))
  },
  id: Cardano.TransactionId(tx.id),
  witness: {
    bootstrap: tx.witness.bootstrap.map(mapBootstrapWitness),
    datums: isAlonzoOrAbove(kind)
      ? Object.values((tx as Schema.TxAlonzo).witness.datums).map((d) => Cardano.util.HexBlob(d))
      : undefined,
    redeemers: isAlonzoOrAbove(kind)
      ? Object.entries((tx as Schema.TxAlonzo).witness.redeemers).map(([key, value]) => mapRedeemer(key, value))
      : undefined,
    scripts: [...Object.values(tx.witness.scripts).map(mapScript)],
    signatures: new Map(
      Object.entries(tx.witness.signatures).map(([key, value]) => [
        Cardano.Ed25519PublicKey(key),
        Cardano.Ed25519Signature(Cardano.util.HexBlob.fromBase64(value).toString())
      ])
    )
  }
});

export const mapCommonBlockBody = ({ body }: CommonBlock, kind: BlockKind): Cardano.Block['body'] =>
  body.map((blockBody) => mapCommonTx(blockBody, kind));

export const mapByronTxFee = ({ raw }: Schema.TxByron) => {
  const txSize = Buffer.from(Cardano.util.Base64Blob(raw).toString(), 'base64').length;
  return BigInt(BYRON_TX_FEE_COEFFICIENT * txSize + BYRON_TX_FEE_CONSTANT);
};

const mapByronTx = (tx: Schema.TxByron): Cardano.Tx => ({
  body: {
    fee: mapByronTxFee(tx),
    inputs: tx.body.inputs.map(mapTxIn),
    outputs: tx.body.outputs.map(mapTxOut)
  },
  id: Cardano.TransactionId(tx.id),
  witness: {
    signatures: new Map()
  }
});

export const mapByronBlockBody = ({ body }: Schema.StandardBlock): Cardano.Block['body'] =>
  body.txPayload.map((txPayload) => mapByronTx(txPayload));