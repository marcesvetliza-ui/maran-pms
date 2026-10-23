import type {SupportDiagnosis} from '../../shared/programming-support';

/** A read-verified draft is useful evidence, never a completed coverage review. */
export function partialDiagnosis(draft:SupportDiagnosis):SupportDiagnosis {
  return {
    ...draft,
    validationStatus:'incomplete',
    certainty:'hipotesis',
    summary:'Revisión parcial: no se completó la validación final del diagnóstico. Se conservan las referencias consultadas, pero no se publica una conclusión ni una instrucción operativa sin esa revisión.',
    cause:'',
    proposal:'Completar la revisión de la evidencia antes de decidir un cambio u operación.',
    dataRepair:'',
    questions:[],
    proposedTests:[],
    evidence:draft.evidence.map(({path,start,end})=>({path,start,end,explanation:'Fragmento consultado; su lectura no constituye una conclusión validada.'})),
    limitations:[
      'No se completó la revisión final de todos los requisitos; se requiere revisión humana.',
      'Inspección de código: no se ejecutaron pruebas ni se consultó la base operativa.',
      'No se aplicó ningún cambio.',
    ],
  };
}
