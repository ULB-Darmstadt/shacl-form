# Designing forms using SHACL-FORM

## Recursive process

The structure of the HTML5 data form is linked to the order of the `sh:NodeShape`s in the shape file, and governed by the hierarchical use of `sh:node` and `sh:group`. SHACL form will start the form building process by using the first NodeShape as its basis or the shape mentioned in the `data-shape-subject` attribute. The recursive process followed then is:

- First render the `sh:NodeShape` linked under `sh:node` in the NodeShape BEFORE any of its own `sh:property`. In the example, this causes `example:Dataset` to be the first displayed, and the core triples to be of `dcat:Dataset` (its `sh:targetClass`). Note that this causes the remaining properties of `ex:ArchitectureModelDataset` also to become part of the instance of `dcat:Dataset`.
- When no such `sh:node` is present, render all the `sh:property`, instantiating them as instances of the `sh:targetClass` of the active NodeShape, and using the property under `sh:path`.
- When any `sh:property` contains `sh:node`, actively render the linked NodeShape FIRST as per process, while assuring a link to this instance using `sh:path`. If the `sh:property` contains a `owl:imports`, first import the data from that source. Note that `sh:node` causes instances of the `sh:targetClass` of the refered NodeShape, to which uniquely created subject nodes will link.
- When a `sh:property` contains `sh:node` within a `sh:or`, the user is forced to first select from the labels provided, which will trigger further rendering of the NodeShape under the `sh:node` with that label.
- When a `sh:property` contains `sh:class`, the property will get its proposed values from instances of that Class, be it known through `owl:imports`, or by using the `setClassInstanceProvider()` asynchronous function which can retrieve the `rdfs:label`-ed values from a `text/turtle` source.
- When a `sh:group` is encountered, a regrouping tab or other separator is used with the `rdfs:label` of that `sh:PropertyGroup` as its title. The rendering is located there.
- When all `sh:property` are rendered, return to the previous active NodeShape, and add the properties to the class of the last active NodeShape.

The rendering halts when the tree as constructed through `sh:node` is handled in full. When parts of your form do not render, check if the rendering algorithm can reach the missing NodeShape.

## Example analysis

### Data at the top of the form

Data at the top of the form is collected under a `ex:Dataset`, a `sh:NodeShape` , `rdfs:Class`. It is triggered to render first, because the first NodeShape of the example `ex:ArchitectureModelDataset` immediately activates it using `sh:node`.

```SHACL
example:Dataset   a               sh:NodeShape, rdfs:Class ;
                  sh:targetClass  _CLASS to which the data belongs_ ;

# For all the properties to show at the top of the form:
sh:property [
    sh:path _property in graph_ ;

    # description of the shape
    sh:datatype _datatype_ ;
    sh:name _Label of the field_ ;
    sh:description _Description under the field_ ;
    sh:minCount, sh:maxCount ...

    # select values which are IRI's
    sh:nodeKind     sh:IRI ;
    sh:in (
        # see below how labels are added to the list entries
        <http://creativecommons.org/licenses/by/4.0/>
        <http://creativecommons.org/licenses/by-nc/4.0/>
        )

]

# FORM FRAGMENT (creates a unique new subjectNode, with all triples belonging to the Fragment's class, which probably should NOT be the main class)
sh:property   [ 
    sh:name         "Title of the Fragment" ;
    sh:node         :FormFragmentName ;  
    sh:path         _property towards the blankNode_ ;
] ;

```

### Data moved in Form fragments (blank nodes)

A form fragment is created using `sh:node`. The definition is a NodeShape.
A form fragment can open other fragments, again using `sh:node`. The fragments must be put UNDER the datasets above, in order to assure shacl-form does not start with them.

> [!IMPORTANT]
> Properties defined under any Form fragment will all belong to the class defined in that NodeShape. It cannot be the class of the main data.

```SHACL
:FormFragmentName
  a               sh:NodeShape ;
  sh:targetClass  _Class to which this data belongs_.

  # Import an external taxonomy to the shapes graph.
  # In this case, the taxonomy provides class instances of prov:Role,
  # which will be displayed in a dropdown to select from.
  owl:imports     <https://w3id.org/nfdi4ing/metadata4ing/> ;

  sh:property   [ sh:maxCount  1 ;
                  sh:minCount  1 ;
                  sh:path      prov:agent ; # Property of this triple
                  sh:or (
                    [ sh:node example:Person ; rdfs:label "Person" ]        
                    [ sh:node example:Organisation ; rdfs:label "Organisation" ]
                  )
                ] ;
  sh:property   [ sh:name      "Role" ;
                  sh:minCount  1 ;
                  sh:path      dcat:hadRole ;
                  sh:class     prov:Role ; # Class to build the dropdown from
                ] ;
  ```

### Other data in the form will belong to the class of the last `sh:node` shape

Placed on top of the shape file (like `ex::ArchitectureModelDataset`), the Datasets not to be shown at the top of the page are `sh:NodeShape, rdfs:Class`, with a `sh:node`-property to the datasets to be rendered before them.

Instances of their `sh:property` will belong to the same class as this NodeShape under `sh:node`.

- Example: the depth of the model, is `schema:depth` of the `dcat:Dataset`-class instance.

Their properties are allowed to define a Form Fragment as well using `sh:node`, which in that case causes them to belong to that fragment's Class. In the example, this is done with `ex:Attribution` and `ex:Location`, which assure their instances to belong to the defined `sh:targetClass`.
