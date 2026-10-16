import type {SupportDiagnosis} from '../../shared/programming-support';

/** A read-verified draft is useful evidence, never a completed coverage review. */
export function partialDiagnosis(draft:SupportDiagnosis):SupportDiagnosis {
  return {
    ...draft,
    certainty:'falta_informacion',
    summary:`Revisión parcial: la investigación alcanzó su límite antes de completar la validación final. Los hallazgos siguientes provienen de un borrador con citas verificadas, pero no constituyen una conclusión definitiva.\n\n${draft.summary}`.slice(0,3000),
    proposal:'Completar la revisión de cobertura antes de decidir un cambio. No aplicar la propuesta del borrador como una solución validada.',
    dataRepair:'',
    limitations:[
      'No se completó la revisión final de todos los requisitos; los hallazgos del borrador requieren revisión humana.',
      ...draft.limitations.slice(0,6),
      'Inspección de código: no se ejecutaron pruebas ni se consultó la base operativa.',
      'No se aplicó ningún cambio.',
    ],
  };
}
