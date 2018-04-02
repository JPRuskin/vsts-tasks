import { AzureRmWebAppDeploymentProvider } from './AzureRmWebAppDeploymentProvider';
import { TaskParameters } from '../operations/TaskParameters';
import { AzureRMEndpoint } from 'azure-arm-rest/azure-arm-endpoint';
import { AzureEndpoint } from 'azure-arm-rest/azureModels';
import { AzureResourceFilterUtility } from '../operations/AzureResourceFilterUtility';
import { KuduServiceUtility } from '../operations/KuduServiceUtility';
import { AzureAppService } from 'azure-arm-rest/azure-arm-app-service';
import { Kudu } from 'azure-arm-rest/azure-arm-app-service-kudu';
import { AzureAppServiceUtility } from '../operations/AzureAppServiceUtility';
import tl = require('vsts-task-lib/task');
import { FileTransformsUtility } from '../operations/FileTransformsUtility';
import { DeployWar } from '../operations/WarDeploymentUtilities';
import * as ParameterParser from '../operations/parameterparser'
import { addReleaseAnnotation } from '../operations/ReleaseAnnotationUtility';
import * as Constant from '../operations/Constants';

var packageUtility = require('webdeployment-common/packageUtility.js');
var deployUtility = require('webdeployment-common/utility.js');
var msDeploy = require('webdeployment-common/deployusingmsdeploy.js');

export class WindowsWebAppDeploymentProvider extends AzureRmWebAppDeploymentProvider{
    protected taskParams:TaskParameters;
    protected appService: AzureAppService;
    protected kuduService: Kudu;
    protected appServiceUtility: AzureAppServiceUtility;
    protected kuduServiceUtility: KuduServiceUtility;
    protected virtualApplicationPath: string;
    protected azureEndpoint: AzureEndpoint;
 
    public async DeployWebAppStep() {
        var webPackage = packageUtility.PackageUtility.getPackagePath(this.taskParams.Package);
        var isFolderBasedDeployment = deployUtility.isInputPkgIsFolder(webPackage);
        var physicalPath: string = Constant.SiteRoot;

        if(this.taskParams.VirtualApplication) {
            physicalPath = await this.appServiceUtility.getPhysicalPath(this.taskParams.VirtualApplication);
            await this.kuduServiceUtility.createPathIfRequired(physicalPath);
            this.virtualApplicationPath = physicalPath;
        }

        webPackage = await FileTransformsUtility.applyTransformations(webPackage, this.taskParams);

        if(deployUtility.canUseWebDeploy(this.taskParams.UseWebDeploy)) {
            tl.debug("Performing the deployment of webapp.");
            if(!tl.osType().match(/^Win/)){
                throw Error(tl.loc("PublishusingwebdeployoptionsaresupportedonlywhenusingWindowsagent"));
            }

            if(this.taskParams.RenameFilesFlag) {
                await this.appServiceUtility.enableRenameLockedFiles();
            }

            var msDeployPublishingProfile = await this.appServiceUtility.getWebDeployPublishingProfile();

            if (webPackage.toString().toLowerCase().endsWith('.war')) {
                await DeployWar(webPackage, this.taskParams, msDeployPublishingProfile, this.kuduService, this.appServiceUtility);
            }
            else {
                await msDeploy.DeployUsingMSDeploy(webPackage, this.taskParams.WebAppName, msDeployPublishingProfile, 
                    this.taskParams.RemoveAdditionalFilesFlag, this.taskParams.ExcludeFilesFromAppDataFlag, this.taskParams.TakeAppOfflineFlag,
                    this.taskParams.VirtualApplication, this.taskParams.SetParametersFile, this.taskParams.AdditionalArguments,
                    isFolderBasedDeployment, this.taskParams.UseWebDeploy);
            }
        }
        else {
            tl.debug("Initiated deployment via kudu service for webapp package : ");
            await this.kuduServiceUtility.deployWebPackage(webPackage, physicalPath, this.taskParams.VirtualApplication, this.taskParams.TakeAppOfflineFlag);
        }

        await this.UpdateWebAppSettings();
    }
}